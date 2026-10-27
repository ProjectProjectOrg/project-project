import {
  TicketStatus,
  type Ticket,
  type TicketId,
  type TicketSort,
  type UpdateTicketInput
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

import { placeholderId, predictedTicket, type QuickCreateArg } from "./backlog"
import { applyTicketPatch } from "./ticketPatch"

export type EpicsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const epicsRequest = (orgSlug: string, slug: string): EpicsRequest => ({
  params: { orgSlug, slug }
})

const EPIC_SORT: TicketSort = { key: "title", dir: "asc" }

const epicsQuery = (req: EpicsRequest, archived: boolean) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { type: ["epic"], archived, sort: EPIC_SORT },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(projectScope(req.params.orgSlug, req.params.slug))
    ]
  })

export const projectEpics = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicsQuery(req, false), (page) =>
    page.items.map((row) => row.ticket)
  )
)

const titlesOf = (
  page: Readonly<{ items: ReadonlyArray<Readonly<{ ticket: Ticket }>> }>
): ReadonlyMap<TicketId, string> =>
  new Map(page.items.map(({ ticket }) => [ticket.id, ticket.title]))

export const openEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicsQuery(req, false), titlesOf)
)

export const archivedEpicTitles = Atom.family((req: EpicsRequest) =>
  Atom.mapResult(epicsQuery(req, true), titlesOf)
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

export type SubTicketRow = Readonly<{
  ticket: Ticket
  key: string
  pending: boolean
}>

const SUB_TICKET_SORT: TicketSort = { key: "created", dir: "asc" }

const TODO = Schema.decodeSync(TicketStatus)("todo")

const scopeOf = (req: SubTicketsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const subTicketsQuery = (req: SubTicketsRequest) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { parent: [req.parent], sort: SUB_TICKET_SORT },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const createdKeys = Atom.family((_req: SubTicketsRequest) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const subTicketsView = (req: SubTicketsRequest) =>
  Atom.readable(
    (get) => {
      const keys = get(createdKeys(req))
      return AsyncResult.map(
        get(subTicketsQuery(req)),
        (page): ReadonlyArray<SubTicketRow> =>
          page.items.map(({ ticket }) => ({
            ticket,
            key: keys.get(ticket.id) ?? ticket.id,
            pending: false
          }))
      )
    },
    (refresh) => refresh(subTicketsQuery(req))
  )

export const subTickets = Atom.family((req: SubTicketsRequest) =>
  Atom.optimistic(subTicketsView(req))
)

const publishFor = (req: SubTicketsRequest) => [
  Keys.ticketsIn(scopeOf(req)),
  Keys.ticketLists(scopeOf(req)),
  Keys.ticketPages(scopeOf(req))
]

export const quickCreateSubTicket = Atom.family((req: SubTicketsRequest) =>
  Atom.optimisticFn(subTickets(req), {
    reducer: (current, input: QuickCreateArg) =>
      AsyncResult.map(current, (rows) => [
        ...rows,
        {
          ticket: predictedTicket(
            input,
            placeholderId(rows, input.projectPrefix),
            input.ticket.status ?? TODO
          ),
          key: input.clientId,
          pending: true
        }
      ]),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("quickCreateSubTicket")(function* (
          input: QuickCreateArg,
          get
        ) {
          const created = yield* Api.use((client) =>
            client.tickets.quickCreate({
              params: req.params,
              payload: input.ticket
            })
          )
          const keys = createdKeys(req)
          get.set(keys, new Map(get(keys)).set(created.id, input.clientId))
          set(
            AsyncResult.map(get(subTickets(req)), (rows) =>
              rows.map((row) =>
                row.key === input.clientId
                  ? { ticket: created, key: input.clientId, pending: false }
                  : row
              )
            )
          )
          yield* Reactivity.invalidate(publishFor(req))
          return created
        })
      )
  })
)

const unsavedPatch = Atom.family(
  (_key: Readonly<{ req: SubTicketsRequest; id: TicketId }>) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateSubTicket = Atom.family(
  ({ req, id }: Readonly<{ req: SubTicketsRequest; id: TicketId }>) =>
    Atom.optimisticFn(subTickets(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (rows) =>
          rows.flatMap((row) => {
            if (row.ticket.id !== id) return [row]
            const ticket = applyTicketPatch(row.ticket, patch)
            return ticket.parent === req.parent ? [{ ...row, ticket }] : []
          })
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateSubTicket")(function* (
            patch: UpdateTicketInput,
            get
          ) {
            const unsaved = unsavedPatch({ req, id })
            const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
            get.set(unsaved, payload)
            const { ticket: updated } = yield* Effect.catchCause(
              Api.use((client) =>
                client.tickets.update({
                  params: { ...req.params, id },
                  query: {},
                  payload
                })
              ),
              (cause) => {
                if (
                  !Cause.hasInterruptsOnly(cause) &&
                  get(unsaved) === payload
                ) {
                  get.set(unsaved, {})
                }
                return Effect.failCause(cause)
              }
            )
            set(
              AsyncResult.map(get(subTickets(req)), (rows) =>
                rows.flatMap((row) =>
                  row.ticket.id !== id
                    ? [row]
                    : updated.parent === req.parent
                      ? [{ ...row, ticket: updated }]
                      : []
                )
              )
            )
            yield* Reactivity.invalidate([
              ...publishFor(req),
              Keys.ticket(scopeOf(req), id)
            ])
            if (get(unsaved) === payload) get.set(unsaved, {})
            return updated
          })
        )
    })
)
