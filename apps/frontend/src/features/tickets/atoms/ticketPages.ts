import {
  DEFAULT_TICKET_SORT,
  type ParentFilter,
  type TicketStatus
} from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

export type TicketPageFilter = Readonly<{
  status?: ReadonlyArray<TicketStatus>
  parent?: ReadonlyArray<ParentFilter>
}>

export type TicketPageRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  q: string | undefined
  cursor: string | undefined
  filter: TicketPageFilter
}>

export const ticketPageRequest = (
  orgSlug: string,
  slug: string,
  q: string,
  cursor: string | null,
  filter: TicketPageFilter = {}
): TicketPageRequest => ({
  params: { orgSlug, slug },
  q: q === "" ? undefined : q,
  cursor: cursor ?? undefined,
  filter
})

export const ticketPage = Atom.family((req: TicketPageRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return query("tickets", "list", {
    params: req.params,
    query: {
      ...req.filter,
      q: req.q,
      sort: DEFAULT_TICKET_SORT,
      cursor: req.cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })
})
