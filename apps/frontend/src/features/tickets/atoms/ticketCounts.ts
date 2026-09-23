import { TicketCountQuery } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type CountsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketCountQuery
}>

const countFilters = Schema.decodeSync(Schema.toType(TicketCountQuery))

export const countsRequest = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): CountsRequest => ({
  params: { orgSlug, slug },
  query: countFilters(query)
})

const countsQuery = (req: CountsRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "count", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })
}

export const ticketCounts = Atom.family((req: CountsRequest) =>
  countsQuery(req)
)
