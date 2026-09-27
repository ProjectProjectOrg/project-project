import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Atom from "effect/unstable/reactivity/Atom"

import { copy } from "@/copy"
import { appRuntime } from "@/runtime"
import type { CatalogFailure } from "@/servers/ServerStore"

import { ServerAuth, type SignInFailure } from "./ServerAuth"

export const signInAtom = Atom.family((instanceId: string) =>
  appRuntime.fn(() =>
    Effect.gen(function* () {
      const auth = yield* ServerAuth
      return yield* auth.signIn(instanceId)
    })
  )
)

export const signOutAtom = Atom.family((instanceId: string) =>
  appRuntime.fn(() =>
    Effect.gen(function* () {
      const auth = yield* ServerAuth
      yield* auth.signOut(instanceId)
    })
  )
)

export const refreshAccountAtom = Atom.family((instanceId: string) =>
  appRuntime.fn(() =>
    Effect.gen(function* () {
      const auth = yield* ServerAuth
      yield* auth.refreshAccount(instanceId)
    })
  )
)

export const signInProblem = (error: SignInFailure | CatalogFailure) =>
  Match.value(error).pipe(
    Match.tag("SignInCancelled", () => null),
    Match.tag("InstanceChanged", () => copy.signInInstanceChanged),
    Match.tags({
      ServerCheckFailed: () => copy.signInUnreachable,
      AuthUnavailable: () => copy.signInUnreachable
    }),
    Match.orElse(() => copy.signInFailed)
  )
