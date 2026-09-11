import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
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

export interface BoardRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: GroupId
  }
}

export const boardRequest = (
  orgSlug: string,
  slug: string,
  id: GroupId
): BoardRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: BoardRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export interface BoardValue {
  readonly tickets: ReadonlyArray<Ticket>
  readonly completedAt: Date | null
}

const ticketsQuery = (req: BoardRequest) =>
  Api.query("groups", "listTickets", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req), req.params.id)
    ]
  })

const boardView = (req: BoardRequest) =>
  Atom.readable(
    (get) => {
      const group = get(sprintQuery({ params: req.params }))
      const tickets = get(ticketsQuery(req))
      return AsyncResult.map(
        AsyncResult.all([group, tickets]),
        ([groupValue, ticketsValue]) => {
          const byId = new Map(ticketsValue.map((t) => [t.id, t]))
          const ordered: Array<Ticket> = []
          for (const id of groupValue.tickets) {
            const ticket = byId.get(id)
            if (ticket) ordered.push(ticket)
          }
          return {
            tickets: ordered,
            completedAt: groupValue.completedAt
          }
        }
      )
    },
    (refresh) => {
      refresh(sprintQuery({ params: req.params }))
      refresh(ticketsQuery(req))
    }
  )

export const sprintBoard = Atom.family((req: BoardRequest) =>
  Atom.optimistic(boardView(req))
)

export function splitCarryover(
  ticketIds: ReadonlyArray<TicketId>,
  statuses: ReadonlyMap<string, string>
): { stay: ReadonlyArray<TicketId>; carry: ReadonlyArray<TicketId> } {
  const stay: Array<TicketId> = []
  const carry: Array<TicketId> = []
  for (const tid of ticketIds) {
    const status = statuses.get(tid)
    if (status === "done") stay.push(tid)
    else carry.push(tid)
  }
  return { stay, carry }
}

const placeTicket = (
  value: BoardValue,
  input: UpdateTicketOrderInput
): BoardValue => {
  const moved = value.tickets.find((t) => t.id === input.ticketId)
  if (!moved) return value
  const filtered = value.tickets.filter((t) => t.id !== input.ticketId)
  if (input.after !== null && !filtered.some((t) => t.id === input.after)) {
    return value
  }
  const insertAt =
    input.after === null
      ? 0
      : filtered.findIndex((t) => t.id === input.after) + 1
  const ticket =
    input.status !== undefined
      ? applyTicketPatch(moved, { status: input.status })
      : moved
  const next = [...filtered]
  next.splice(insertAt, 0, ticket)
  return { ...value, tickets: next }
}

export const placeBoardTicket = Atom.family((req: BoardRequest) =>
  Atom.optimisticFn(sprintBoard(req), {
    reducer: (current, input: UpdateTicketOrderInput) =>
      AsyncResult.map(current, (value) => placeTicket(value, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: UpdateTicketOrderInput) {
          yield* Api.use((client) =>
            client.groups.updateTicketOrder({
              params: req.params,
              payload: input
            })
          )
          yield* Reactivity.invalidate(
            input.status === undefined
              ? [Keys.sprint(scopeOf(req), req.params.id)]
              : [
                  Keys.sprint(scopeOf(req), req.params.id),
                  Keys.ticket(scopeOf(req), input.ticketId),
                  Keys.ticketLists(scopeOf(req)),
                  Keys.ticketPages(scopeOf(req))
                ]
          )
        })
      )
  })
)

export const updateBoardTicket = Atom.family(
  ({ req, id }: { readonly req: BoardRequest; readonly id: TicketId }) =>
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
          Effect.fn(function* (patch: UpdateTicketInput, get) {
            const updated = yield* Api.use((client) =>
              client.tickets.update({
                params: { ...req.params, id },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(sprintBoard(req)), (value) => ({
                ...value,
                tickets: value.tickets.map((t) => (t.id === id ? updated : t))
              }))
            )
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
            return updated
          })
        )
    })
)
