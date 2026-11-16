import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Stream from "effect/Stream"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { currentUserId } from "@/features/auth/atoms/auth"

import { localDatabaseLayer } from "../lib/localDatabase"
import { localShadowChecks } from "../lib/localShadow"
import {
  applySync,
  cursorOf,
  differences,
  purge,
  readFacts,
  snapshotFacts
} from "../lib/localStore"

export type LocalSyncState = "live" | "behind" | "offline" | "erroring"

export type LocalStatus =
  | Readonly<{ kind: "initializing" }>
  | Readonly<{ kind: "ready"; sync: LocalSyncState }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "failed" }>

class SignedOut extends Data.TaggedError("SignedOut") {}

export const localRuntime = Api.runtime.factory((get) => {
  const userId = get(currentUserId)
  const api = get(Api.runtime.layer)
  return Layer.unwrap(
    Effect.gen(function* () {
      if (userId === undefined) return yield* new SignedOut()
      return Layer.merge(api, localDatabaseLayer(userId))
    })
  )
})

export type LocalProjectRequest = Readonly<{ orgSlug: string; slug: string }>

const pullUntilApplied = ({ orgSlug, slug }: LocalProjectRequest) =>
  Effect.gen(function* () {
    const api = yield* Api
    const scope = projectScope(orgSlug, slug)
    const after = yield* cursorOf(scope)
    const sync = yield* api.sync.project({
      params: { orgSlug, slug },
      query: after === null ? {} : { after }
    })
    return yield* applySync(scope, after, sync)
  }).pipe(Effect.repeat({ until: (applied) => applied === "applied" }))

const syncStatus = (request: LocalProjectRequest) => {
  const scope = projectScope(request.orgSlug, request.slug)
  const unavailable = (sync: LocalSyncState) =>
    Effect.map(
      cursorOf(scope),
      (cursor): LocalStatus =>
        cursor === null ? { kind: "failed" } : { kind: "ready", sync }
    )
  return pullUntilApplied(request).pipe(
    Effect.as<LocalStatus>({ kind: "ready", sync: "live" }),
    Effect.catchTags({
      NotFound: () => Effect.as(purge(scope), { kind: "denied" } as const),
      Forbidden: () => Effect.as(purge(scope), { kind: "denied" } as const),
      HttpClientError: () => unavailable("offline")
    }),
    Effect.catchCause((cause) =>
      Effect.logWarning("local copy sync failed", cause).pipe(
        Effect.andThen(unavailable("erroring"))
      )
    ),
    Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
  )
}

const shadowCheck = ({ orgSlug, slug }: LocalProjectRequest) =>
  Effect.gen(function* () {
    const api = yield* Api
    const scope = projectScope(orgSlug, slug)
    const server = yield* api.sync.project({
      params: { orgSlug, slug },
      query: {}
    })
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

export const localProject = Atom.family((request: LocalProjectRequest) =>
  localRuntime.atom(
    Stream.unwrap(
      Effect.gen(function* () {
        const scope = projectScope(request.orgSlug, request.slug)
        const hydrated = (yield* cursorOf(scope)) !== null
        const checkOnce = yield* Effect.cached(shadowCheck(request))
        const initial: LocalStatus = hydrated
          ? { kind: "ready", sync: "behind" }
          : { kind: "initializing" }
        return Stream.concat(
          Stream.make(initial),
          Reactivity.stream(syncStatus(request), [
            Keys.projectFacts(scope),
            Keys.liveResync()
          ]).pipe(
            Stream.tap((status) =>
              localShadowChecks() &&
              status.kind === "ready" &&
              status.sync === "live"
                ? Effect.forkDetach(checkOnce)
                : Effect.void
            )
          )
        )
      })
    )
  ).pipe(Atom.setIdleTTL("30 seconds"))
)

export const localReady = Atom.family((request: LocalProjectRequest) =>
  Atom.make((get) => {
    const status = get(localProject(request))
    if (AsyncResult.isInitial(status)) return undefined
    return AsyncResult.isSuccess(status) && status.value.kind === "ready"
  })
)
