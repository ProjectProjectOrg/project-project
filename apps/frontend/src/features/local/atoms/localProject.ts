import type { LocalStatus } from "@pp/local"
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

import { LocalClient, localClientLayer } from "../lib/localClient"
import { localShadowChecks } from "../lib/localShadow"

export type { LocalStatus }

class SignedOut extends Data.TaggedError("SignedOut") {}

export const localRuntime = Api.runtime.factory((get) => {
  const userId = get.once(currentUserId) ?? get(currentUserId)
  const api = get.once(Api.runtime.layer)
  return Layer.unwrap(
    Effect.gen(function* () {
      if (userId === undefined) return yield* new SignedOut()
      return Layer.merge(api, localClientLayer(userId))
    })
  )
})

export type LocalProjectRequest = Readonly<{ orgSlug: string; slug: string }>

const pull = (request: LocalProjectRequest) =>
  Effect.flatMap(LocalClient, (client) => client.Pull(request)).pipe(
    Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
  )

export const localProject = Atom.family((request: LocalProjectRequest) =>
  localRuntime
    .atom(
      Stream.unwrap(
        Effect.gen(function* () {
          const client = yield* LocalClient
          const scope = projectScope(request.orgSlug, request.slug)
          const hydrated = yield* client.Hydrated(request)
          const checkOnce = yield* Effect.cached(client.CheckFacts(request))
          const initial: LocalStatus = hydrated
            ? { kind: "ready", sync: "behind" }
            : { kind: "initializing" }
          return Stream.concat(
            Stream.make(initial),
            Reactivity.stream(pull(request), [
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
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

export const localReady = Atom.family((request: LocalProjectRequest) =>
  Atom.make((get) => {
    const status = get(localProject(request))
    if (AsyncResult.isInitial(status)) return undefined
    return AsyncResult.isSuccess(status) && status.value.kind === "ready"
  })
)
