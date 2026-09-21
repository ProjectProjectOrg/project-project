import * as Atom from "effect/unstable/reactivity/Atom"
import type { GroupId, TicketSearchQuery } from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type TicketSearchOptions = Readonly<{
  q?: string
  excludeGroupId?: GroupId
  limit?: number
}>

export type SearchRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketSearchQuery
}>

export const searchRequest = (
  orgSlug: string,
  slug: string,
  options: TicketSearchOptions
): SearchRequest => ({
  params: { orgSlug, slug },
  query: options
})

export const ticketSearch = Atom.family((req: SearchRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "search", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })
})
