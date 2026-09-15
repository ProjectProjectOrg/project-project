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
  /** Ticket order as the group defines it, resolved to full tickets. */
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

/**
 * The board is one region fed by two endpoints: the group supplies order and
 * completion, the ticket list supplies content and status. Both are refreshed
 * together, and the composed result reports `waiting` until both settle, which
 * is what makes `Atom.optimistic` hold the drag preview for the whole round
 * trip.
 */
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

/** The value every board consumer reads. */
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

/** Drag: reorder within a column, or move across columns (which changes status). */
export const placeBoardTicket = Atom.family((req: BoardRequest) =>
  Atom.optimisticFn(sprintBoard(req), {
    reducer: (current, input: UpdateTicketOrderInput) =>
      AsyncResult.map(current, (value) => placeTicket(value, input)),
    fn: Api.runtime.fn(
      Effect.fn(function* (input: UpdateTicketOrderInput) {
        yield* Api.use((client) =>
          client.groups.updateTicketOrder({
            params: req.params,
            payload: input
          })
        )
        if (input.status !== undefined) {
          yield* Reactivity.invalidate([
            Keys.ticket(scopeOf(req), input.ticketId),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
        }
      })
    )
  })
)

/** Editing a card's fields from the board. */
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
