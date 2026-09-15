import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export interface OAuthConsentRequest {
  readonly oauthQuery: string
}

export const oauthConsentRequest = (
  oauthQuery: string
): OAuthConsentRequest => ({ oauthQuery })

export interface SubmitConsentInput {
  readonly accept: boolean
}

export const submitConsentAtom = Atom.family((req: OAuthConsentRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (input: SubmitConsentInput) {
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

export interface OAuthClientRequest {
  readonly query: { readonly client_id: string } | null
}

export const oauthClientRequest = (
  clientId: string | undefined
): OAuthClientRequest => ({
  query: clientId ? { client_id: clientId } : null
})

const missingOAuthClient = Atom.make(
  AsyncResult.success<{ readonly name: string | null }>({ name: null })
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
  Atom.optimistic(oauthClientNameQuery(req))
)
