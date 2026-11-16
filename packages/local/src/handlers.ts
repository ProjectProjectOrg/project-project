import { type SnapshotPage, snapshotFromPages } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import {
  type CountsRequest,
  type LocalProject,
  LocalRpcs,
  type LocalStatus,
  type LocalSyncState,
  scopeOf,
  type SectionsRequest
} from "./LocalRpcs"
import { LOCAL_SECTION_TABLES, localCounts, localSections } from "./sections"
import {
  applySync,
  copyOf,
  cursorOf,
  differences,
  purge,
  readFacts,
  snapshotFacts
} from "./store"
import { SyncSource } from "./SyncSource"

const sectionsRequest = (request: SectionsRequest, copy: number) => ({
  copy,
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation,
  repository: (repoId: string | null) =>
    repoId === null
      ? request.repositories.fallback
      : (request.repositories.byId[repoId] ?? null),
  perStatus: (status: string) => request.limits[status] ?? request.defaultLimit
})

const countsRequest = (request: CountsRequest, copy: number) => ({
  copy,
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation
})

const unavailable = (scope: string, state: LocalSyncState) =>
  Effect.map(
    cursorOf(scope),
    (cursor): LocalStatus =>
      cursor === null ? { kind: "failed" } : { kind: "ready", sync: state }
  )

export const localRpcsLayer = LocalRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const reactivity = yield* Reactivity.Reactivity
    const source = yield* SyncSource
    const changed = reactivity.invalidate(LOCAL_SECTION_TABLES)

    const collectSnapshot = (project: LocalProject, first: SnapshotPage) =>
      Effect.gen(function* () {
        let page = first
        let pages = [page]
        let start = page.start
        while (page.next !== null) {
          const next = yield* source.pull(project, { page: page.next })
          if (next.kind !== "snapshot")
            return yield* Effect.die(new Error("expected a snapshot page"))
          page = next
          if (page.start === null) pages.push(page)
          else {
            pages = [page]
            start = page.start
          }
        }
        if (start === null)
          return yield* Effect.die(new Error("snapshot without a start page"))
        return snapshotFromPages(start, pages, page.base)
      })

    const pullOnce = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const after = yield* cursorOf(scope)
        const first = yield* source.pull(
          project,
          after === null ? {} : { after }
        )
        if (first.kind === "changes") {
          const applied = yield* applySync(scope, after, first)
          return applied === "stale" || first.more ? "again" : "caughtUp"
        }
        yield* applySync(scope, after, yield* collectSnapshot(project, first))
        return "again"
      })

    const pullUntilApplied = (project: LocalProject) =>
      pullOnce(project).pipe(
        Effect.repeat({ until: (state) => state === "caughtUp" })
      )

    const pull = (project: LocalProject) => {
      const scope = scopeOf(project)
      return pullUntilApplied(project).pipe(
        Effect.andThen(changed),
        Effect.as<LocalStatus>({ kind: "ready", sync: "live" }),
        Effect.catchTags({
          SyncDenied: () =>
            purge(scope).pipe(
              Effect.andThen(changed),
              Effect.as<LocalStatus>({ kind: "denied" })
            ),
          SyncOffline: () => unavailable(scope, "offline")
        }),
        Effect.catchCause((cause) =>
          Effect.logWarning("local copy sync failed", cause).pipe(
            Effect.andThen(unavailable(scope, "erroring"))
          )
        ),
        Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
      )
    }

    const checkFacts = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const first = yield* source.pull(project, {})
        if (first.kind !== "snapshot")
          return yield* Effect.logInfo("local copy shadow check got changes")
        const server = yield* collectSnapshot(project, first)
        const local = yield* readFacts(scope)
        if (local.cursor !== server.cursor)
          return yield* Effect.logInfo(
            `local copy of ${scope} is at ${local.cursor}, server at ${server.cursor}; shadow check skipped`
          )
        const differing = differences(local, snapshotFacts(server))
        return yield* differing.length === 0
          ? Effect.logInfo(
              `local copy of ${scope} matches the server at ${server.cursor}`
            )
          : Effect.logWarning(
              `local copy of ${scope} differs from the server at ${server.cursor}`,
              differing
            )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("local copy shadow check failed", cause)
        )
      )

    const readCopy = <A, E, R>(
      project: LocalProject,
      read: (copy: number) => Effect.Effect<A | null, E, R>
    ) =>
      sql.withTransaction(
        Effect.flatMap(copyOf(scopeOf(project)), (copy) =>
          copy === null ? Effect.succeed(null) : read(copy)
        )
      )

    return {
      Hydrated: (project) =>
        cursorOf(scopeOf(project)).pipe(
          Effect.map((cursor) => cursor !== null),
          Effect.orDie
        ),
      Pull: pull,
      CheckFacts: checkFacts,
      Sections: (request) =>
        sql
          .reactive(
            LOCAL_SECTION_TABLES,
            readCopy(request.project, (copy) =>
              localSections(sectionsRequest(request, copy))
            )
          )
          .pipe(Stream.orDie),
      Counts: (request) =>
        sql
          .reactive(
            LOCAL_SECTION_TABLES,
            readCopy(request.project, (copy) =>
              localCounts(countsRequest(request, copy))
            )
          )
          .pipe(Stream.orDie)
    }
  })
)
