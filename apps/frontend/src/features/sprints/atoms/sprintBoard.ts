import type {
  GroupId,
  Ticket,
  TicketId,
  UpdateTicketOrderInput
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import {
  bindRowMutation,
  keepPredicted,
  viewMutation
} from "@/api/viewMutation"
import { coalescingTicketUpdate } from "@/features/tickets/atoms/ticketRows"
import { applyTicketPatch } from "@/features/tickets/lib/ticketPatch"

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
  Api.query("groups", "listTickets", {
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
      return AsyncResult.map(combined, ([group, tickets]): BoardValue => {
        const byId = new Map(tickets.map((t) => [t.id, t]))
        const ordered: Array<Ticket> = []
        for (const id of group.tickets) {
          const ticket = byId.get(id)
          if (ticket) ordered.push(ticket)
        }
        return { tickets: ordered, completedAt: group.completedAt }
      })
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

const placeTicket = (
  value: BoardValue,
  input: UpdateTicketOrderInput
): BoardValue => {
  const moving = value.tickets.find((t) => t.id === input.ticketId)
  if (!moving) return value
  const without = value.tickets.filter((t) => t.id !== input.ticketId)
  const patched =
    input.status !== undefined ? { ...moving, status: input.status } : moving
  const index =
    input.after === null
      ? 0
      : without.findIndex((t) => t.id === input.after) + 1
  return {
    ...value,
    tickets: [...without.slice(0, index), patched, ...without.slice(index)]
  }
}

type BoardTicketUpdateKey = Readonly<{
  req: BoardRequest
  id: TicketId
}>

const boardTicketKeys = (req: BoardRequest, id: TicketId) => [
  ...Keys.ticketChanged(scopeOf(req), id),
  Keys.ticketUpdatedQuery(scopeOf(req))
]

export const placeBoardTicket = Atom.family(
  ({ req, id }: BoardTicketUpdateKey) =>
    viewMutation(sprintBoard(req), {
      name: "placeBoardTicket",
      predict: (value, input: UpdateTicketOrderInput) =>
        placeTicket(value, { ...input, ticketId: id }),
      call: (input) =>
        Api.use((client) =>
          client.groups.updateTicketOrder({
            params: req.params,
            payload: { ...input, ticketId: id }
          })
        ),
      confirm: keepPredicted,
      publish: (_confirmed, input) =>
        input.status === undefined ? [] : boardTicketKeys(req, id)
    })
)

export const updateBoardTicket = Atom.family(
  ({ req, id }: BoardTicketUpdateKey) =>
    coalescingTicketUpdate(sprintBoard(req), {
      name: "updateBoardTicket",
      path: { ...req.params, id },
      idleTTL: "10 minutes",
      predict: (value, patch) => ({
        ...value,
        tickets: value.tickets.map((t) =>
          t.id === id ? applyTicketPatch(t, patch) : t
        )
      }),
      confirm: (value, { ticket }) => ({
        ...value,
        tickets: value.tickets.map((t) => (t.id === id ? ticket : t))
      }),
      publish: () => boardTicketKeys(req, id)
    })
)

export const boardTicketUpdates = bindRowMutation(updateBoardTicket)
