import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type {
  ArchiveTicketInput,
  TicketId,
  UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { applyTicketDetailPatch } from "./ticketPatch"

export type TicketRequest = Readonly<{
  params: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
}>

export const ticketRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: TicketRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const ticketQuery = (req: TicketRequest) =>
  Api.query("tickets", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

/** The detail value every consumer reads. */
export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketQuery(req))
)

export const ticketBodyDraft = Atom.family((_req: TicketRequest) =>
  Atom.make<string | null>(null).pipe(Atom.setIdleTTL("10 minutes"))
)

const publishFor = (req: TicketRequest, patch: UpdateTicketInput) => {
  const scope = scopeOf(req)
  const fields = Object.keys(patch)
  const contentOnly = fields.every((f) => f === "title" || f === "body")
  if (!contentOnly) {
    return [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketPages(scope)
    ]
  }
  const keys = [Keys.ticketUpdatedQuery(scope), Keys.ticketsIn(scope)]
  if (patch.title !== undefined) {
    keys.push(Keys.ticketTitleQuery(scope))
  }
  return keys
}

const unsavedTicketPatch = Atom.family((_req: TicketRequest) =>
  Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("10 minutes"))
)

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, patch: UpdateTicketInput) =>
      AsyncResult.map(current, (ticket) =>
        applyTicketDetailPatch(ticket, patch)
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("updateTicketDetail")(function* (
          patch: UpdateTicketInput,
          get
        ) {
          const unsaved = unsavedTicketPatch(req)
          const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
          get.set(unsaved, payload)
          const { ticket: updated } = yield* Effect.catchCause(
            Api.use((client) =>
              client.tickets.update({
                params: req.params,
                query: {},
                payload
              })
            ),
            (cause) => {
              if (!Cause.hasInterruptsOnly(cause) && get(unsaved) === payload) {
                get.set(unsaved, {})
              }
              return Effect.failCause(cause)
            }
          )
          if (get(unsaved) === payload) get.set(unsaved, {})
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate(publishFor(req, payload))
          return updated
        })
      )
  })
)

export const archiveTicket = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, _input: ArchiveTicketInput) =>
      AsyncResult.map(current, (ticket) =>
        ticket.archivedAt === null
          ? { ...ticket, archivedAt: DateTime.toDate(DateTime.nowUnsafe()) }
          : ticket
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("archiveTicket")(function* (input: ArchiveTicketInput) {
          const updated = yield* Api.use((client) =>
            client.tickets.archive({ params: req.params, payload: input })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const unarchiveTicket = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (ticket) => ({ ...ticket, archivedAt: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("unarchiveTicket")(function* (_input: void) {
          const updated = yield* Api.use((client) =>
            client.tickets.unarchive({ params: req.params })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const deleteTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("deleteTicket")(function* (_input: void) {
      yield* Api.use((client) => client.tickets.delete({ params: req.params }))
      yield* Reactivity.invalidate([
        Keys.ticketsIn(scopeOf(req)),
        Keys.ticketLists(scopeOf(req)),
        Keys.ticketPages(scopeOf(req))
      ])
    })
  )
)
