import type { GroupId, Ticket, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { bindRowMutation } from "@/api/viewMutation"
import { coalescingTicketUpdate } from "@/features/tickets/atoms/ticketRows"
import { applyTicketPatch } from "@/features/tickets/lib/ticketPatch"
import { compareByRank } from "@/features/tickets/lib/ticketRank"

import { sprintQuery, sprintRequest } from "./sprintDetail"

export type BoardRequest = Readonly<{
  _view: "sprintBoard"
  params: Readonly<{
    orgSlug: string
    slug: string
    id: GroupId
  }>
}>

export const boardRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): BoardRequest => ({ _view: "sprintBoard", params: { orgSlug, slug, id } })

const scopeOf = (req: BoardRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type BoardValue = Readonly<{
  tickets: ReadonlyArray<Ticket>
  completedAt: Date | null
}>

const ticketsQuery = (req: BoardRequest) =>
  query("groups", "listTickets", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req), req.params.id),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const boardView = (req: BoardRequest) => {
  const sprint = sprintQuery(
    sprintRequest(req.params.orgSlug, req.params.slug, req.params.id)
  )
  return Atom.readable(
    (get) => {
      const combined = AsyncResult.all([get(sprint), get(ticketsQuery(req))])
      return AsyncResult.map(
        combined,
        ([group, tickets]): BoardValue => ({
          tickets: tickets.toSorted(compareByRank),
          completedAt: group.completedAt
        })
      )
    },
    (refresh) => {
      refresh(sprint)
      refresh(ticketsQuery(req))
    }
  )
}

export const sprintBoard = Atom.family((req: BoardRequest) =>
  Atom.optimistic(boardView(req))
)

type BoardTicketUpdateKey = Readonly<{
  req: BoardRequest
  id: TicketId
}>

const boardTicketKeys = (req: BoardRequest, id: TicketId) => [
  ...Keys.ticketChanged(scopeOf(req), id),
  Keys.ticketUpdatedQuery(scopeOf(req))
]

export const updateBoardTicket = Atom.family(
  ({ req, id }: BoardTicketUpdateKey) =>
    coalescingTicketUpdate(sprintBoard(req), {
      name: "updateBoardTicket",
      path: { ...req.params, id },
      idleTTL: "10 minutes",
      predict: (value, patch) => ({
        ...value,
        tickets: value.tickets
          .map((t) => (t.id === id ? applyTicketPatch(t, patch) : t))
          .toSorted(compareByRank)
      }),
      confirm: (value, { ticket }) => ({
        ...value,
        tickets: value.tickets
          .map((t) => (t.id === id ? ticket : t))
          .toSorted(compareByRank)
      }),
      publish: () => boardTicketKeys(req, id)
    })
)

export const boardTicketUpdates = bindRowMutation(updateBoardTicket)
