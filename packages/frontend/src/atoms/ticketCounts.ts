import * as Atom from "effect/unstable/reactivity/Atom"
import type { TicketCountQuery } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface CountsRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: TicketCountQuery
}

export const countsRequest = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): CountsRequest => ({
  params: { orgSlug, slug },
  query
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

/**
 * Counts are read by the project sidebar, which never mutates them directly.
 * The wrapper exists so a future count-affecting mutation has something to
 * target, and so `waiting` is available for the badge.
 */
export const ticketCounts = Atom.family((req: CountsRequest) =>
  Atom.optimistic(countsQuery(req))
)
