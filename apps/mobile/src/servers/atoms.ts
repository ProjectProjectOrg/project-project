import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"

import { appRuntime } from "@/runtime"

import { ServerStore } from "./ServerStore"

export const serverKeys = {
  catalog: () => ["servers", "catalog"] as const
}

export const savedServers = appRuntime
  .atom(
    Effect.gen(function* () {
      const store = yield* ServerStore
      return yield* store.list
    })
  )
  .pipe(Atom.withReactivity(serverKeys.catalog()))

export const lastUsedOrg = appRuntime
  .atom(
    Effect.gen(function* () {
      const store = yield* ServerStore
      return yield* store.lastUsedOrg
    })
  )
  .pipe(Atom.withReactivity(serverKeys.catalog()))
