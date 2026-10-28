import {
  TicketStatus,
  type TicketId,
  type TicketListPage,
  type TicketListRow,
  type TicketSort
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { bindRowMutation, viewMutation } from "@/api/viewMutation"
import {
  patchTicketRow,
  placeholderRow,
  toRow,
  withCreatedKeys,
  type QuickCreateInput,
  type TicketRow
} from "@/features/tickets/lib/ticketRows"

import {
  coalescingTicketUpdate,
  createdKeys,
  recordCreatedKey
} from "./ticketRows"

export type EpicsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const epicsRequest = (orgSlug: string, slug: string): EpicsRequest => ({
  params: { orgSlug, slug }
})

const EPIC_SORT: TicketSort = { key: "title", dir: "asc" }

const allPages = <E>(
  get: Atom.AtomContext,
  page: (
    cursor: string | undefined
  ) => Atom.Atom<AsyncResult.AsyncResult<TicketListPage, E>>
): AsyncResult.AsyncResult<ReadonlyArray<TicketListRow>, E> => {
  const rows: Array<TicketListRow> = []
  let cursor: string | undefined = undefined
  let waiting = false
  do {
    const result: AsyncResult.AsyncResult<TicketListPage, E> = get(page(cursor))
    if (!AsyncResult.isSuccess(result)) {
      return AsyncResult.map(result, (): ReadonlyArray<TicketListRow> => rows)
    }
    rows.push(...result.value.items)
    waiting ||= result.waiting
    cursor = result.value.nextCursor ?? undefined
  } while (cursor !== undefined)
  return AsyncResult.success(rows, { waiting })
}

const epicsPage = (
  req: EpicsRequest,
  archived: boolean,
  cursor: string | undefined
) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      type: ["epic"],
      archived,
      sort: EPIC_SORT,
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })

const epicRows = (req: EpicsRequest, archived: boolean) =>
  Atom.readable(
    (get) => allPages(get, (cursor) => epicsPage(req, archived, cursor)),
    (refresh) => refresh(epicsPage(req, archived, undefined))
  )

export const projectEpics = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, false), (rows) => rows.map((row) => row.ticket))
)

const titlesOf = (
  rows: ReadonlyArray<TicketListRow>
): ReadonlyMap<TicketId, string> =>
  new Map(rows.map(({ ticket }) => [ticket.id, ticket.title]))

export const openEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, false), titlesOf)
)

export const archivedEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicRows(req, true), titlesOf)
)

export type SubTicketsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  parent: TicketId
}>

export const subTicketsRequest = (
  orgSlug: string,
  slug: string,
  parent: TicketId
): SubTicketsRequest => ({ params: { orgSlug, slug }, parent })

const SUB_TICKET_SORT: TicketSort = { key: "created", dir: "asc" }

const scopeOf = (req: SubTicketsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const subTicketsPage = (req: SubTicketsRequest, cursor: string | undefined) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      parent: [req.parent],
      sort: SUB_TICKET_SORT,
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const subTicketsView = (req: SubTicketsRequest) =>
  Atom.readable(
    (get) => {
      const created = get(createdKeys(scopeOf(req)))
      return AsyncResult.map(
        allPages(get, (cursor) => subTicketsPage(req, cursor)),
        (rows): ReadonlyArray<TicketRow> =>
          withCreatedKeys(rows.map(toRow), created)
      )
    },
    (refresh) => refresh(subTicketsPage(req, undefined))
  )

export const subTickets = Atom.family((req: SubTicketsRequest) =>
  Atom.optimistic(subTicketsView(req))
)

export const quickCreateSubTicket = Atom.family((req: SubTicketsRequest) =>
  viewMutation(subTickets(req), {
    name: "quickCreateSubTicket",
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

export const updateSubTicket = Atom.family(
  ({ req, id }: Readonly<{ req: SubTicketsRequest; id: TicketId }>) =>
    coalescingTicketUpdate(subTickets(req), {
      name: "updateSubTicket",
      path: { ...req.params, id },
      predict: (rows, patch) =>
        rows.flatMap((row) => {
          if (row.ticket.id !== id) return [row]
          const next = patchTicketRow(
            row,
            patch,
            SUB_TICKET_SORT,
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

export const subTicketUpdates = bindRowMutation(updateSubTicket)
