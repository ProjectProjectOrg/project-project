import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type {
  GroupId,
  Ticket,
  TicketId,
  UpdateTicketInput,
  UpdateTicketOrderInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { sprintQuery } from "./sprintDetail"
import { applyTicketPatch } from "./ticketPatch"

export type BoardRequest = Readonly<{
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
): BoardRequest => ({ params: { orgSlug, slug, id } })

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

const boardView = (req: BoardRequest) =>
  Atom.readable(
    (get) => {
      const combined = AsyncResult.all([
        get(sprintQuery(req)),
        get(ticketsQuery(req))
      ])
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
      refresh(sprintQuery(req))
      refresh(ticketsQuery(req))
    }
  )

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

const unsavedBoardTicketPatch = Atom.family((_key: BoardTicketUpdateKey) =>
  Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("10 minutes"))
)

/** Drag: reorder within a column, or move across columns (which changes status). */
export const placeBoardTicket = Atom.family(
  ({ req, id }: BoardTicketUpdateKey) =>
    Atom.optimisticFn(sprintBoard(req), {
      reducer: (current, input: UpdateTicketOrderInput) =>
        AsyncResult.map(current, (value) =>
          placeTicket(value, { ...input, ticketId: id })
        ),
      fn: Api.runtime.fn(
        Effect.fn("placeBoardTicket")(function* (
          input: UpdateTicketOrderInput
        ) {
          yield* Api.use((client) =>
            client.groups.updateTicketOrder({
              params: req.params,
              payload: { ...input, ticketId: id }
            })
          )
          if (input.status !== undefined) {
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req)),
              Keys.ticketUpdatedQuery(scopeOf(req))
            ])
          }
        })
      )
    })
)

/** Editing a card's fields from the board. */
export const updateBoardTicket = Atom.family(
  ({ req, id }: BoardTicketUpdateKey) =>
    Atom.optimisticFn(sprintBoard(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) => ({
          ...value,
          tickets: value.tickets.map((t) =>
            t.id === id ? applyTicketPatch(t, patch) : t
          )
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateBoardTicket")(function* (
            patch: UpdateTicketInput,
            get
          ) {
            const unsaved = unsavedBoardTicketPatch({ req, id })
            const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
            get.set(unsaved, payload)
            const updated = yield* Effect.catchCause(
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
            if (get(unsaved) === payload) get.set(unsaved, {})
            set(
              AsyncResult.map(get(sprintBoard(req)), (value) => ({
                ...value,
                tickets: value.tickets.map((t) =>
                  t.id === id ? updated.ticket : t
                )
              }))
            )
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req)),
              Keys.ticketUpdatedQuery(scopeOf(req))
            ])
            return updated.ticket
          })
        )
    })
)
