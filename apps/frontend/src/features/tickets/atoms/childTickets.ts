import {
  CHILD_TICKET_SORT,
  TicketStatus,
  type CreateTicketInput,
  type Ticket,
  type TicketId,
  type TicketParent
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { bindRowMutation, fireMutation, viewMutation } from "@/api/viewMutation"
import {
  insertByOrderKey,
  localOrderKey,
  patchTicketRow,
  placeholderRow,
  toRow,
  withCreatedKeys,
  type QuickCreatePrediction,
  type TicketRow
} from "@/features/tickets/lib/ticketRows"

import { allPages } from "./allPages"
import {
  bulkTicketUpdate,
  coalescingTicketUpdate,
  createdKeys,
  recordCreatedKey
} from "./ticketRows"

export type ChildTicketsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  parent: TicketId
}>

export const childTicketsRequest = (
  orgSlug: string,
  slug: string,
  parent: TicketId
): ChildTicketsRequest => ({ params: { orgSlug, slug }, parent })

const scopeOf = (req: ChildTicketsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const childTicketsPage = (
  req: ChildTicketsRequest,
  cursor: string | undefined
) =>
  query("tickets", "list", {
    params: req.params,
    query: {
      parent: [req.parent],
      sort: CHILD_TICKET_SORT,
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const childTicketsView = (req: ChildTicketsRequest) =>
  Atom.readable(
    (get) => {
      const created = get(createdKeys(scopeOf(req)))
      return AsyncResult.map(
        allPages(get, (cursor) => childTicketsPage(req, cursor)),
        (rows): ReadonlyArray<TicketRow> =>
          withCreatedKeys(rows.map(toRow), created)
      )
    },
    (refresh) => refresh(childTicketsPage(req, undefined))
  )

export const childTickets = Atom.family((req: ChildTicketsRequest) =>
  Atom.optimistic(childTicketsView(req))
)

export type ExpandedChildrenRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  parents: ReadonlyArray<TicketId>
}>

export const expandedChildrenRequest = (
  orgSlug: string,
  slug: string,
  parents: ReadonlySet<TicketId>
): ExpandedChildrenRequest => ({
  params: { orgSlug, slug },
  parents: [...parents].toSorted()
})

const childOf = (req: ExpandedChildrenRequest, parent: TicketId) =>
  childTicketsRequest(req.params.orgSlug, req.params.slug, parent)

export const expandedChildTickets = Atom.family(
  (req: ExpandedChildrenRequest) =>
    Atom.readable(
      (get) =>
        new Map(
          req.parents.map((parent) => [
            parent,
            get(childTickets(childOf(req, parent)))
          ])
        ),
      (refresh) =>
        req.parents.forEach((parent) =>
          refresh(childTickets(childOf(req, parent)))
        )
    )
)

export const expandedChildrenSettled = Atom.family(
  (reqs: ReadonlyArray<ExpandedChildrenRequest>) =>
    Atom.readable((get) =>
      reqs.every((req) =>
        [...get(expandedChildTickets(req)).values()].every(
          (result) => !AsyncResult.isInitial(result)
        )
      )
    )
)

export type ChildTicketCreateInput = Readonly<{
  payload: Omit<CreateTicketInput, "parent">
  parent: TicketParent
  prediction: QuickCreatePrediction
}>

export const createChildTicket = Atom.family((req: ChildTicketsRequest) =>
  viewMutation(childTickets(req), {
    name: "createChildTicket",
    predict: (rows, input: ChildTicketCreateInput) => {
      const row = placeholderRow(
        input,
        rows,
        input.payload.status ?? TicketStatus.make("todo"),
        DateTime.toDate(DateTime.nowUnsafe())
      )
      const { priority, assignees, estimate } = input.payload
      return [
        ...rows,
        {
          ...row,
          ticket: {
            ...row.ticket,
            priority: priority ?? row.ticket.priority,
            assignees: assignees ?? [],
            estimate: estimate ?? null
          }
        }
      ]
    },
    call: (client, input, get) =>
      client.tickets
        .create({
          params: req.params,
          payload: { ...input.payload, parent: input.parent.id }
        })
        .pipe(
          Effect.tap((created) =>
            Effect.sync(() =>
              recordCreatedKey(
                get,
                scopeOf(req),
                created.id,
                input.prediction.clientId
              )
            )
          )
        ),
    confirm: (rows, created, input) =>
      rows.map((row) =>
        row.key === input.prediction.clientId
          ? { ...row, ticket: created, pending: false }
          : row
      ),
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })
)

type ChildTicketKey = Readonly<{ req: ChildTicketsRequest; id: TicketId }>

export const updateChildTicket = Atom.family(({ req, id }: ChildTicketKey) =>
  coalescingTicketUpdate(childTickets(req), {
    name: "updateChildTicket",
    path: { ...req.params, id },
    predict: (rows, patch) =>
      rows.flatMap((row) => {
        if (row.ticket.id !== id) return [row]
        const next = patchTicketRow(
          row,
          patch,
          CHILD_TICKET_SORT,
          DateTime.toDate(DateTime.nowUnsafe())
        )
        return next.ticket.parent?.id === req.parent ? [next] : []
      }),
    confirm: (rows, { ticket }) =>
      rows.flatMap((row) =>
        row.ticket.id !== id
          ? [row]
          : ticket.parent?.id === req.parent
            ? [{ ...row, ticket }]
            : []
      )
  })
)

export const childTicketUpdates = bindRowMutation(updateChildTicket)

export const bulkUpdateChildTickets = Atom.family((req: ChildTicketsRequest) =>
  bulkTicketUpdate(childTickets(req), {
    name: "bulkUpdateChildTickets",
    path: req.params,
    predict: (rows, id, edit) =>
      rows.flatMap((row) => {
        if (row.ticket.id !== id) return [row]
        const next = patchTicketRow(
          row,
          edit,
          CHILD_TICKET_SORT,
          DateTime.toDate(DateTime.nowUnsafe())
        )
        return next.ticket.parent?.id === req.parent ? [next] : []
      })
  })
)

const attachedRow = (ticket: Ticket): TicketRow => ({
  ticket,
  key: ticket.id,
  orderKey: localOrderKey(ticket, CHILD_TICKET_SORT),
  pending: false
})

type AttachInput = Readonly<{ ticket: Ticket; parent: TicketParent }>

export const attachChildTicket = Atom.family(({ req, id }: ChildTicketKey) =>
  viewMutation(childTickets(req), {
    name: "attachChildTicket",
    predict: (rows, { ticket, parent }: AttachInput) =>
      insertByOrderKey(
        rows.filter((row) => row.ticket.id !== id),
        attachedRow({ ...ticket, parent }),
        CHILD_TICKET_SORT.dir
      ),
    call: (client) =>
      client.tickets.update({
        params: { ...req.params, id },
        query: {},
        payload: { parent: req.parent }
      }),
    confirm: (rows, { ticket }) =>
      rows.map((row) => (row.ticket.id === id ? { ...row, ticket } : row)),
    publish: () => Keys.ticketChanged(scopeOf(req), id)
  })
)

export const attachToParent = (
  registry: Registry.AtomRegistry,
  req: ChildTicketsRequest,
  parent: TicketParent,
  ticket: Ticket
): void => {
  void fireMutation(registry, attachChildTicket({ req, id: ticket.id }), {
    ticket,
    parent
  })
}
