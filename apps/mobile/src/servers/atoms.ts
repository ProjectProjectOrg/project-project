import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Atom from "effect/unstable/reactivity/Atom"

import { appRuntime } from "@/runtime"

import { serverKeys } from "./keys"
import { ServerStore } from "./ServerStore"

export { serverKeys }

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

export const signedInServers = appRuntime
  .atom(
    Effect.gen(function* () {
      const store = yield* ServerStore
      const servers = yield* store.list
      const signedIn = yield* Effect.filter(servers, (server) =>
        store.tokens(server.instanceId).pipe(Effect.map(Option.isSome))
      )
      return signedIn.map((server) => server.instanceId)
    })
  )
  .pipe(Atom.withReactivity(serverKeys.catalog()))
