import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Stream from "effect/Stream"

import { Keys, projectScope } from "@/api/keys"

import { LocalClient } from "../lib/localClient"
import { type LocalProjectRequest, localRuntime } from "./localProject"

export const localDiagnostics = Atom.family((request: LocalProjectRequest) =>
  localRuntime.atom(
    Stream.unwrap(
      Effect.map(LocalClient, (client) => client.Diagnostics(request))
    )
  )
)

export const simulateOffline = Atom.family((request: LocalProjectRequest) =>
  localRuntime.fn(
    Effect.fn("simulateOffline")(function* (offline: boolean) {
      const client = yield* LocalClient
      yield* client.SimulateOffline({ offline })
      yield* Reactivity.invalidate([
        Keys.projectFacts(projectScope(request.orgSlug, request.slug))
      ])
    })
  )
)
