import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type OAuthApplicationsRequest = Readonly<{}>

export const oauthApplicationsRequest = (): OAuthApplicationsRequest => ({})

const oauthApplicationsQuery = (_req: OAuthApplicationsRequest) =>
  Api.query("oauthApplications", "list", {
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.oauthApplications()]
  })

export const oauthApplicationsAtom = Atom.family(
  (req: OAuthApplicationsRequest) =>
    Atom.optimistic(oauthApplicationsQuery(req))
)

export const revokeOAuthApplicationAtom = Atom.family(
  ({
    req,
    id
  }: Readonly<{
    req: OAuthApplicationsRequest
    id: string
  }>) =>
    Atom.optimisticFn(oauthApplicationsAtom(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (applications) =>
          applications.filter((application) => application.id !== id)
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void, get) {
            const result = yield* Api.use((client) =>
              client.oauthApplications.revoke({ params: { id } })
            )
            set(
              AsyncResult.map(get(oauthApplicationsAtom(req)), (applications) =>
                applications.filter((application) => application.id !== id)
              )
            )
            return result
          })
        )
    })
)
