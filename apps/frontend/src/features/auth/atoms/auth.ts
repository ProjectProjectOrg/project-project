import type { UpdateUserSettingsInput, User } from "@pp/shared"
import type { BetterFetchError } from "better-auth/react"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"
import { applySettingsPatch } from "@/features/profile/lib/userSettings"
import { clearBannerRenderCache } from "@/features/projects/lib/bannerRenderCache"
import { authClient } from "@/services/AuthClient"

const meQuery = query("auth", "me", {
  reactivityKeys: [Keys.me()]
})

const meAtom = Atom.optimistic(meQuery)

export const me = () => meAtom

export const signInProviders = query("publicAuth", "signInProviders", {
  timeToLive: "5 minutes"
})

export const currentUserId = Atom.make((get) => {
  const viewer = get(meAtom)
  return AsyncResult.isSuccess(viewer) ? viewer.value.id : undefined
})

export const sendMagicLink = Api.runtime.fn(
  Effect.fn("sendMagicLink")(function* (
    input: Readonly<{ email: string; callbackURL: string }>
  ) {
    yield* Effect.tryPromise(() => authData(authClient.signIn.magicLink(input)))
  })
)

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
          callbackURL: "/profile/connections",
          errorCallbackURL: "/profile/connections",
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

const activeOrgSlugOf = (viewer: AsyncResult.AsyncResult<User, unknown>) =>
  AsyncResult.isSuccess(viewer) ? viewer.value.activeOrgSlug : null

export const updateSettings = viewMutation(meAtom, {
  name: "updateSettings",
  predict: (user, patch: UpdateUserSettingsInput) =>
    applySettingsPatch(user, patch),
  call: (client, patch, get) =>
    client.auth.updateSettings({ payload: patch }).pipe(
      Effect.map((settings) => ({
        settings,
        orgSlug: activeOrgSlugOf(get(meAtom))
      }))
    ),
  confirm: (user, { settings }) => ({ ...user, settings }),
  publish: ({ orgSlug }, patch) =>
    patch.avatarSource === undefined || orgSlug === null
      ? [Keys.me()]
      : [Keys.me(), Keys.orgMembers(orgSlug)]
})

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
