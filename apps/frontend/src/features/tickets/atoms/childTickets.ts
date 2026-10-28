import {
  TicketStatus,
  type Ticket,
  type TicketId,
  type TicketSort
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { bindRowMutation, fireMutation, viewMutation } from "@/api/viewMutation"
import {
  insertByOrderKey,
  localOrderKey,
  patchTicketRow,
  placeholderRow,
  toRow,
  withCreatedKeys,
  type QuickCreateInput,
  type TicketRow
} from "@/features/tickets/lib/ticketRows"

import { allPages } from "./allPages"
import {
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

const CHILD_TICKET_SORT: TicketSort = { key: "created", dir: "asc" }

const scopeOf = (req: ChildTicketsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const childTicketsPage = (
  req: ChildTicketsRequest,
  cursor: string | undefined
) =>
  Api.query("tickets", "list", {
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

export const expandedChildTickets = Atom.family(
  (req: ExpandedChildrenRequest) =>
    Atom.readable(
      (get) =>
        new Map(
          req.parents.map((parent) => [
            parent,
            get(
              childTickets(
                childTicketsRequest(req.params.orgSlug, req.params.slug, parent)
              )
            )
          ])
        )
    )
)

export const quickCreateChildTicket = Atom.family((req: ChildTicketsRequest) =>
  viewMutation(childTickets(req), {
    name: "quickCreateChildTicket",
    predict: (rows, input: QuickCreateInput) => [
      ...rows,
      placeholderRow(
        input,
        rows,
        input.payload.status ?? TicketStatus.make("todo"),
        DateTime.toDate(DateTime.nowUnsafe())
      )
    ],
    call: (client, input, get) =>
      client.tickets
        .quickCreate({ params: req.params, payload: input.payload })
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
        return next.ticket.parent === req.parent ? [next] : []
      }),
    confirm: (rows, { ticket }) =>
      rows.flatMap((row) =>
        row.ticket.id !== id
          ? [row]
          : ticket.parent === req.parent
            ? [{ ...row, ticket }]
            : []
      )
  })
)

export const childTicketUpdates = bindRowMutation(updateChildTicket)

const attachedRow = (ticket: Ticket): TicketRow => ({
  ticket,
  key: ticket.id,
  orderKey: localOrderKey(ticket, CHILD_TICKET_SORT),
  pending: false
})

export const attachChildTicket = Atom.family(({ req, id }: ChildTicketKey) =>
  viewMutation(childTickets(req), {
    name: "attachChildTicket",
    predict: (rows, ticket: Ticket) =>
      insertByOrderKey(
        rows.filter((row) => row.ticket.id !== id),
        attachedRow({ ...ticket, parent: req.parent }),
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
  ticket: Ticket
): void => {
  void fireMutation(registry, attachChildTicket({ req, id: ticket.id }), ticket)
}
