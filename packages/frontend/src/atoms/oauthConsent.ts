import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"
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
      return yield* Api.use((client) =>
        client.oauthApplications.consent({
          payload: {
            accept: input.accept,
            oauth_query: req.oauthQuery
          }
        })
      )
    })
  )
)

export interface OAuthClientRequest {
  readonly query: { readonly client_id: string }
}

export const oauthClientRequest = (clientId: string): OAuthClientRequest => ({
  query: { client_id: clientId }
})

const oauthClientNameQuery = (req: OAuthClientRequest) =>
  Api.query("publicOAuth", "publicClient", {
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.oauthClient(req.query.client_id)]
  })

export const oauthClientNameAtom = Atom.family((req: OAuthClientRequest) =>
  Atom.optimistic(oauthClientNameQuery(req))
)
