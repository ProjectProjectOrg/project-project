import type { TicketCountQuery, TicketFacetField } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

export type FacetsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string; field: TicketFacetField }>
  query: TicketCountQuery
}>

export const facetsRequest = (
  orgSlug: string,
  slug: string,
  field: TicketFacetField,
  { scopeGroupId, rules, hasBranch, hasPr, updatedAfter, parent, subTickets, q }: TicketCountQuery
): FacetsRequest => ({
  params: { orgSlug, slug, field },
  query: { scopeGroupId, rules, hasBranch, hasPr, updatedAfter, parent, subTickets, q }
})

export const ticketFacets = Atom.family((req: FacetsRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return query("tickets", "facets", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scope), Keys.ticketLists(scope)]
  })
})
