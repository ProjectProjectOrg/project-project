import * as Atom from "effect/unstable/reactivity/Atom"
import {
  ticketListQueryToSearch,
  type TicketCountQuery
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface CountsRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string | ReadonlyArray<string>>
}

export const countsRequest = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): CountsRequest => ({
  params: { orgSlug, slug },
  query: ticketListQueryToSearch(query)
})

const countsQuery = (req: CountsRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "count", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scope), Keys.ticketLists(scope)]
  })
}

export const ticketCounts = Atom.family((req: CountsRequest) =>
  Atom.optimistic(countsQuery(req))
)
