import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Atom from "effect/unstable/reactivity/Atom"

import { ServerAuth } from "@/auth/ServerAuth"
import { appRuntime } from "@/runtime"

import { serverKeys } from "./keys"
import { ServerStore } from "./ServerStore"
import { serverStatus } from "./status"

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
  .pipe(
    Atom.withReactivity([...serverKeys.catalog(), ...serverKeys.lastUsed()])
  )

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

export const serverStatusAtom = Atom.family((instanceId: string) =>
  appRuntime
    .atom(
      Effect.gen(function* () {
        const store = yield* ServerStore
        const server = (yield* store.list).find(
          (saved) => saved.instanceId === instanceId
        )
        if (server === undefined) return Option.none()
        const tokens = yield* store.tokens(instanceId)
        return Option.some(yield* serverStatus(server, Option.isSome(tokens)))
      })
    )
    .pipe(Atom.withReactivity(serverKeys.catalog()))
)

export const removeServerAtom = Atom.family((instanceId: string) =>
  appRuntime.fn(() =>
    Effect.gen(function* () {
      const auth = yield* ServerAuth
      yield* auth.remove(instanceId)
    })
  )
)
