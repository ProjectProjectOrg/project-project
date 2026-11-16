import type { ProjectSync, SyncCursor } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"

import {
  type CountsRequest,
  type LocalProject,
  type LocalPull,
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
import { SyncOffline, SyncSource } from "./SyncSource"

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

const factCount = (sync: ProjectSync) => {
  const facts = sync.kind === "snapshot" ? sync : sync.upserts
  const upserted =
    facts.tickets.length +
    facts.groups.length +
    facts.statuses.length +
    facts.tags.length +
    facts.members.length
  if (sync.kind === "snapshot") return upserted
  return Object.values(sync.deletes).reduce(
    (total, ids) => total + ids.length,
    upserted
  )
}

type Diagnostics = Readonly<{
  offline: boolean
  pulls: Readonly<Record<string, LocalPull>>
}>

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
    const diagnostics = yield* SubscriptionRef.make<Diagnostics>({
      offline: false,
      pulls: {}
    })

    const pullFrom = (project: LocalProject, after: SyncCursor | null) =>
      Effect.flatMap(SubscriptionRef.get(diagnostics), ({ offline }) =>
        offline ? Effect.fail(new SyncOffline()) : source.pull(project, after)
      )

    const record = (
      scope: string,
      sync: ProjectSync,
      took: Duration.Duration
    ) =>
      Effect.flatMap(Clock.currentTimeMillis, (at) =>
        SubscriptionRef.update(diagnostics, (current) => ({
          ...current,
          pulls: {
            ...current.pulls,
            [scope]: {
              at,
              millis: Duration.toMillis(took),
              kind: sync.kind,
              facts: factCount(sync)
            }
          }
        }))
      )

    const pullUntilApplied = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const after = yield* cursorOf(scope)
        const [took, [sync, applied]] = yield* Effect.timed(
          Effect.flatMap(pullFrom(project, after), (sync) =>
            Effect.map(
              applySync(scope, after, sync),
              (applied) => [sync, applied] as const
            )
          )
        )
        if (applied === "applied") yield* record(scope, sync, took)
        return applied
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
        const server = yield* pullFrom(project, null)
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
      Diagnostics: (project) => {
        const scope = scopeOf(project)
        return SubscriptionRef.changes(diagnostics).pipe(
          Stream.mapEffect(({ offline, pulls }) =>
            Effect.map(cursorOf(scope), (cursor) => ({
              cursor,
              lastPull: pulls[scope] ?? null,
              offline
            }))
          ),
          Stream.orDie
        )
      },
      SimulateOffline: ({ offline }) =>
        SubscriptionRef.update(diagnostics, (current) => ({
          ...current,
          offline
        })),
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
