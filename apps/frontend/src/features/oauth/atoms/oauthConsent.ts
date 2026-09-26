import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { authData } from "@/features/auth/atoms/auth"
import { authClient } from "@/services/AuthClient"

export type OAuthConsentRequest = Readonly<{
  oauthQuery: string
}>

export const oauthConsentRequest = (
  oauthQuery: string
): OAuthConsentRequest => ({ oauthQuery })

export type SubmitConsentInput = Readonly<{
  accept: boolean
}>

export const submitConsentAtom = Atom.family((req: OAuthConsentRequest) =>
  Api.runtime.fn(
    Effect.fn("submitConsent")(function* (input: SubmitConsentInput) {
      const result = yield* Api.use((client) =>
        client.oauthApplications.consent({
          payload: {
            accept: input.accept,
            oauth_query: req.oauthQuery
          }
        })
      )
      if (input.accept) {
        yield* Reactivity.invalidate([Keys.oauthApplications()])
      }
      return result
    })
  )
)

export type OAuthClientRequest = Readonly<{
  query: Readonly<{ client_id: string }> | null
}>

export const oauthClientRequest = (
  clientId: string | undefined
): OAuthClientRequest => ({
  query: clientId ? { client_id: clientId } : null
})

const missingOAuthClient = Atom.make(
  AsyncResult.success<Readonly<{ name: string | null }>>({ name: null })
)

const oauthClientNameQuery = (req: OAuthClientRequest) =>
  req.query === null
    ? missingOAuthClient
    : Api.query("publicOAuth", "publicClient", {
        query: req.query,
        timeToLive: "2 minutes",
        reactivityKeys: [Keys.oauthClient(req.query.client_id)]
      })

export const oauthClientNameAtom = Atom.family((req: OAuthClientRequest) =>
  oauthClientNameQuery(req)
)

const freshSignInWindow = Duration.minutes(10)

export const freshSignInAtom = Atom.make(
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise(() =>
      authData(authClient.getSession())
    )
    if (session === null) return false
    const now = yield* DateTime.now
    const signedInAt = DateTime.makeUnsafe(session.session.createdAt)
    return Duration.isLessThanOrEqualTo(
      DateTime.distance(signedInAt, now),
      freshSignInWindow
    )
  })
)
