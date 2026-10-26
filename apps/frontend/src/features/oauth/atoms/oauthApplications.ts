import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { viewMutation } from "@/api/viewMutation"

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

const withoutApplication = <A extends Readonly<{ id: string }>>(
  applications: ReadonlyArray<A>,
  id: string
) => applications.filter((application) => application.id !== id)

export const revokeOAuthApplicationAtom = Atom.family(
  ({
    req,
    id
  }: Readonly<{
    req: OAuthApplicationsRequest
    id: string
  }>) =>
    viewMutation(oauthApplicationsAtom(req), {
      name: "deleteOauthApplication",
      predict: (applications, _input: void) =>
        withoutApplication(applications, id),
      call: () =>
        Api.use((client) =>
          client.oauthApplications.revoke({ params: { id } })
        ),
      confirm: (applications) => withoutApplication(applications, id)
    })
)
