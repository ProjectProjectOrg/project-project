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
export interface TicketRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: TicketId
  }
}

export const ticketRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: TicketRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const ticketQuery = (req: TicketRequest) =>
  Api.query("tickets", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticket(scopeOf(req), req.params.id)]
  })

export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketQuery(req))
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
  const keys = [Keys.ticketUpdatedQuery(scope)]
  if (patch.title !== undefined) {
    keys.push(Keys.ticketsIn(scope), Keys.ticketTitleQuery(scope))
  }
  return keys
}

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, patch: UpdateTicketInput) =>
      AsyncResult.map(current, (ticket) => ({
        ...ticket,
        title: patch.title ?? ticket.title,
        status: patch.status ?? ticket.status,
        type: patch.type ?? ticket.type,
        priority: patch.priority ?? ticket.priority,
        tags: patch.tags ?? ticket.tags,
        assignees: patch.assignees ?? ticket.assignees,
        body: patch.body ?? ticket.body
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (patch: UpdateTicketInput) {
          const updated = yield* Api.use((client) =>
            client.tickets.update({ params: req.params, payload: patch })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate(publishFor(req, patch))
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
          ? { ...ticket, archivedAt: new Date() }
          : ticket
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ArchiveTicketInput) {
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
        Effect.fn(function* (_input: void) {
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
    Effect.fn(function* (_input: void) {
      yield* Api.use((client) => client.tickets.delete({ params: req.params }))
      yield* Reactivity.invalidate([
        Keys.ticketsIn(scopeOf(req)),
        Keys.ticketLists(scopeOf(req)),
        Keys.ticketPages(scopeOf(req))
      ])
    })
  )
)
