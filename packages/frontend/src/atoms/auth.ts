import { Effect } from "effect"
import { runtime } from "@/runtime"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import { authClient } from "@/services/AuthClient"

export const meAtom = AppApiClient.query("auth", "me", {
  reactivityKeys: [ReactivityKey.auth]
})

export const logoutAtom = runtime.fn(
  Effect.fn(function* (_: void, get) {
    yield* Effect.tryPromise(() => authClient.signOut())
    get.refresh(meAtom)
  })
)
