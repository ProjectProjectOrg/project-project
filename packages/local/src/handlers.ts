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
  cursorOf,
  differences,
  purge,
  readFacts,
  snapshotFacts
} from "./store"
import { SyncSource } from "./SyncSource"

const sectionsRequest = (request: SectionsRequest) => ({
  scope: scopeOf(request.project),
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation,
  repository: (repoId: string | null) =>
    repoId === null
      ? request.repositories.fallback
      : (request.repositories.byId[repoId] ?? null),
  perStatus: (status: string) => request.limits[status] ?? request.defaultLimit
})

const countsRequest = (request: CountsRequest) => ({
  scope: scopeOf(request.project),
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

    const pullUntilApplied = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const after = yield* cursorOf(scope)
        const sync = yield* source.pull(project, after)
        return yield* applySync(scope, after, sync)
      }).pipe(Effect.repeat({ until: (applied) => applied === "applied" }))

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
        const server = yield* source.pull(project, null)
        const local = yield* readFacts(scope)
        if (server.kind !== "snapshot" || local.cursor !== server.cursor)
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
            localSections(sectionsRequest(request))
          )
          .pipe(Stream.orDie),
      Counts: (request) =>
        sql
          .reactive(LOCAL_SECTION_TABLES, localCounts(countsRequest(request)))
          .pipe(Stream.orDie)
    }
  })
)
