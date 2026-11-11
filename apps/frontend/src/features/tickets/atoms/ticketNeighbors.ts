import type { TicketId, TicketViewSource } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

export type TicketNeighborsRequest = Readonly<{
  _view: "ticketNeighbors"
  params: Readonly<{ orgSlug: string; slug: string; id: TicketId }>
  from: TicketViewSource
}>

export const ticketNeighborsRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  from: TicketViewSource
): TicketNeighborsRequest => ({
  _view: "ticketNeighbors",
  params: { orgSlug, slug, id },
  from
})

export const ticketNeighbors = Atom.family((req: TicketNeighborsRequest) =>
  query("tickets", "neighbors", {
    params: req.params,
    query: { from: req.from },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })
)
