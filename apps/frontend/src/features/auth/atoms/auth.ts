import type { EditorPreference } from "@pp/shared"
import type { BetterFetchError } from "better-auth/react"
import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { clearBannerRenderCache } from "@/lib/bannerRenderCache"
import { authClient } from "@/services/AuthClient"

const meQuery = Api.query("auth", "me", {
  reactivityKeys: [Keys.me()]
})

const meAtom = Atom.optimistic(meQuery)

export const me = () => meAtom

export const logout = Api.runtime.fn(
  Effect.fn("logout")(function* (_: void) {
    yield* Effect.tryPromise(() => authData(authClient.signOut()))
    yield* Effect.promise(() => clearBannerRenderCache())
  })
)

const publishGithubAuth = Effect.fn("publishGithubAuth")(function* (
  get: Atom.FnContext
) {
  const orgSlug = yield* get.result(me()).pipe(
    Effect.map((user) => user.activeOrgSlug),
    Effect.orElseSucceed(() => null)
  )
  if (orgSlug !== null) {
    yield* Reactivity.invalidate([Keys.githubAuth(orgSlug)])
  }
})

export const connectPersonalGithub = Api.runtime.fn(
  Effect.fn("connectPersonalGithub")(function* (_: void, get) {
    yield* Effect.tryPromise(() =>
      authData(
        authClient.linkSocial({
          provider: "github",
          callbackURL: "/profile",
          errorCallbackURL: "/profile",
          scopes: ["repo", "read:org"]
        })
      )
    )
    yield* publishGithubAuth(get)
  })
)

export const disconnectPersonalGithub = Api.runtime.fn(
  Effect.fn("disconnectPersonalGithub")(function* (_: void, get) {
    const accounts = yield* Effect.tryPromise(() =>
      authData(authClient.listAccounts())
    )
    const githubAccount = accounts?.find(
      (account) => account.providerId === "github"
    )
    if (githubAccount === undefined) return
    yield* Effect.tryPromise(() =>
      authData(authClient.unlinkAccount({ accountId: githubAccount.id }))
    )
    yield* publishGithubAuth(get)
    yield* Reactivity.invalidate([Keys.me()])
  })
)

export const updateEditorPreference = Api.runtime.fn(
  Effect.fn("updateEditorPreference")(function* (
    editorPreference: EditorPreference
  ) {
    yield* Effect.tryPromise(() =>
      authData(authClient.updateUser({ editorPreference }))
    )
    yield* Reactivity.invalidate([Keys.me()])
  })
)

export const setActiveOrganization = Api.runtime.fn(
  Effect.fn("setActiveOrganization")(function* (organizationSlug: string) {
    yield* Api.use((client) =>
      client.org.setActive({ params: { orgSlug: organizationSlug } })
    )
    yield* Reactivity.invalidate([Keys.me()])
  })
)

export type AuthClientError = Pick<
  BetterFetchError,
  "status" | "statusText"
> & {
  code?: string
  message?: string
}

export async function authData<T>(
  response: Promise<{ data: T; error: AuthClientError | null }>
): Promise<T> {
  const { data, error } = await response
  if (error) throw error
  return data
}
