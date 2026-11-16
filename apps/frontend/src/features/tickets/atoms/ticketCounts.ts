import {
  matchesTicketQuery,
  type Ticket,
  type TicketCountQuery,
  type TicketCounts,
  type TicketStatus
} from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { localTicketQuery } from "@/features/local/atoms/localTicketQuery"

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

export const countTickets = (tickets: ReadonlyArray<Ticket>): TicketCounts => {
  const byStatus: Record<TicketStatus, number> = {}
  for (const ticket of tickets) {
    byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1
  }
  return { total: tickets.length, byStatus }
}

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

export const ticketCounts = Atom.family(
  (
    req: CountsRequest
  ): Atom.Atom<AsyncResult.AsyncResult<TicketCounts, unknown>> =>
    (req.query.groupId?.length ?? 0) > 0
      ? countsQuery(req)
      : localTicketQuery(req.params, {
          where: {
            kind: "test",
            test: (ticket, { viewerId, estimation }) =>
              matchesTicketQuery(ticket, req.query, viewerId, estimation)
          },
          select: countTickets
        })
)
