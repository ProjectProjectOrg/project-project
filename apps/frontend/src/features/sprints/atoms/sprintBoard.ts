import {
  TicketStatus,
  type GroupId,
  type Ticket,
  type TicketId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"
import { ticketRowActions } from "@/features/tickets/atoms/markRowRelation"
import {
  coalescingTicketUpdate,
  recordCreatedKey
} from "@/features/tickets/atoms/ticketRows"
import { deletedTicketIds } from "@/features/tickets/lib/deletedTickets"
import { applyTicketPatch } from "@/features/tickets/lib/ticketPatch"
import { compareByRank, predictRank } from "@/features/tickets/lib/ticketRank"
import {
  placeholderId,
  predictedTicket,
  quickCreatePayload,
  type QuickCreateInput
} from "@/features/tickets/lib/ticketRows"

import { sprintQuery, sprintRequest } from "./sprintDetail"
import { createInSprint, sprintAssignmentKeys } from "./sprintList"

export type BoardRequest = ReturnType<typeof boardRequest>

export const boardRequest = (orgSlug: string, slug: string, id: GroupId) =>
  ({
    _view: "sprintBoard",
    params: { orgSlug, slug, id }
  }) as const

const scopeOf = (req: BoardRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type BoardValue = Readonly<{
  tickets: ReadonlyArray<Ticket & Readonly<{ creationKey?: string }>>
  completedAt: Date | null
}>

const ticketsQuery = (req: BoardRequest) =>
  query("groups", "listTickets", {
    params: req.params,
    reactivityKeys: [
      Keys.ticketLists(scopeOf(req)),
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
      return AsyncResult.map(combined, ([group, tickets]) => {
        const board: BoardValue = {
          tickets: tickets.toSorted(compareByRank),
          completedAt: group.completedAt
        }
        return board
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

export const boardTicketUpdates = Atom.family((req: BoardRequest) => ({
  patch: (id: TicketId) => updateBoardTicket({ req, id }),
  ...ticketRowActions(
    sprintBoard(req),
    req.params,
    (value, id, change) => ({
      ...value,
      tickets: value.tickets.map((ticket) =>
        ticket.id === id ? applyTicketPatch(ticket, change) : ticket
      )
    }),
    (value, input) => {
      const ids = deletedTicketIds(value.tickets, input)
      return {
        ...value,
        tickets: value.tickets.filter((ticket) => !ids.has(ticket.id))
      }
    }
  )
}))

const predictedIdOf = (value: BoardValue, input: QuickCreateInput) =>
  placeholderId(
    value.tickets.map((ticket) => ({
      ticket,
      key: ticket.id,
      orderKey: null,
      pending: false
    })),
    input.prediction.projectPrefix
  )

const insertPredicted = (value: BoardValue, input: QuickCreateInput) => {
  const position = input.payload.position
  const id = predictedIdOf(value, input)
  const ticket = {
    ...predictedTicket(
      input,
      id,
      input.payload.status ?? TicketStatus.make("todo"),
      DateTime.toDate(DateTime.nowUnsafe())
    ),
    creationKey: input.prediction.clientId
  }
  const rank =
    position === undefined ? null : predictRank(value.tickets, id, position)
  return {
    ...value,
    tickets: [
      ...value.tickets,
      rank === null ? ticket : { ...ticket, rank }
    ].toSorted(compareByRank)
  }
}

export const quickCreateBoardTicket = Atom.family((req: BoardRequest) =>
  viewMutation(sprintBoard(req), {
    name: "quickCreateBoardTicket",
    predict: insertPredicted,
    call: (_client, input: QuickCreateInput, get, updateView) =>
      createInSprint(
        req.params,
        quickCreatePayload(input),
        req.params.id,
        (created) => {
          recordCreatedKey(
            get,
            scopeOf(req),
            created.id,
            input.prediction.clientId,
            false
          )
          updateView((value) => ({
            ...value,
            tickets: value.tickets
              .map((ticket) =>
                ticket.creationKey === input.prediction.clientId
                  ? created
                  : ticket
              )
              .toSorted(compareByRank)
          }))
        }
      ),
    confirm: (value, created) =>
      created.sprintAssignmentFailed
        ? {
            ...value,
            tickets: value.tickets.filter((ticket) => ticket.id !== created.id)
          }
        : value,
    publish: () => [
      ...Keys.ticketsChanged(scopeOf(req)),
      ...sprintAssignmentKeys(scopeOf(req), req.params.id)
    ]
  })
)
