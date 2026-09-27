import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { copy } from "@/copy"
import { appRuntime } from "@/runtime"
import { serverKeys } from "@/servers/keys"
import type { CatalogFailure } from "@/servers/ServerStore"

import { ServerAuth, type SignInFailure } from "./ServerAuth"

export const signInAtom = appRuntime.fn(
  Effect.fn("signInAtom")(function* (instanceId: string) {
    const auth = yield* ServerAuth
    yield* auth.signIn(instanceId)
    yield* Reactivity.invalidate(serverKeys.catalog())
  })
)

export const signOutAtom = appRuntime.fn(
  Effect.fn("signOutAtom")(function* (instanceId: string) {
    const auth = yield* ServerAuth
    yield* auth.signOut(instanceId)
    yield* Reactivity.invalidate(serverKeys.catalog())
  })
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
