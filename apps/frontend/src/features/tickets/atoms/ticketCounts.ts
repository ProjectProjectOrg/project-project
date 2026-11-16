import type { TicketCountQuery } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { localCounts } from "@/features/local/atoms/localBacklog"
import { readLocal } from "@/features/local/atoms/readLocal"

export type CountsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketCountQuery
}>

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
  return query("tickets", "count", {
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
  Atom.readable(
    (get) =>
      readLocal(get, req.params, () => localCounts(req)) ??
      get(countsQuery(req)),
    (refresh) => refresh(countsQuery(req))
  )
)
