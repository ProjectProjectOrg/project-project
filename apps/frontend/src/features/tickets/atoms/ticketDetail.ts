import {
  type ArchiveTicketInput,
  type DeleteTicketQuery,
  type MarkTicketInput,
  type MoveTicketInput,
  NotFound,
  type SplitTicketInput,
  TicketDetail,
  type TicketId
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { persisted } from "@/api/bootCache"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"
import { localFirst } from "@/features/local/atoms/localEdit"
import { localTicketDetail } from "@/features/local/atoms/localTicket"
import { localRead } from "@/features/local/atoms/readLocal"
import {
  archiveEdit,
  deleteEdit,
  restoreEdit
} from "@/features/local/lib/localIntents"

import { withoutRelation } from "../lib/relationGroups"
import { applyTicketDetailPatch, type TicketEdit } from "../lib/ticketPatch"
import { createdKeys } from "./createdKeys"
import { coalescingTicketUpdate } from "./ticketRows"

export type TicketRequest = Readonly<{
  _view: "ticketDetail"
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
): TicketRequest => ({ _view: "ticketDetail", params: { orgSlug, slug, id } })

const scopeOf = (req: TicketRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const ticketQuery = (req: TicketRequest) =>
  query("tickets", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.orgMembers(req.params.orgSlug),
      Keys.orgLibrary(req.params.orgSlug),
      Keys.projectLibrary(scopeOf(req))
    ]
  })

const localTicketSource = (get: Atom.AtomContext, req: TicketRequest) =>
  AsyncResult.flatMap(
    get(localTicketDetail(req)),
    (ticket, previous): AsyncResult.AsyncResult<TicketDetail, NotFound> => {
      if (ticket !== null) return AsyncResult.success(ticket, previous)
      return previous.waiting ||
        get(createdKeys(scopeOf(req))).has(req.params.id)
        ? AsyncResult.initial(true)
        : AsyncResult.fail(new NotFound())
    }
  )

export const ticketSource = (req: TicketRequest) =>
  Atom.readable(
    (get) =>
      localRead(get, req.params)
        ? localTicketSource(get, req)
        : get(ticketQuery(req)),
    (refresh) => refresh(ticketQuery(req))
  ).pipe(persisted(`ticket/${scopeOf(req)}/${req.params.id}`, TicketDetail))

export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketSource(req))
)

const movedTicketQuery = (req: TicketRequest) =>
  query("tickets", "movedTo", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticket(scopeOf(req), req.params.id)]
  })

export const movedTicket = Atom.family((req: TicketRequest) =>
  Atom.optimistic(movedTicketQuery(req))
)

export const lastKnownBeforeNotFound = (
  result: AsyncResult.AsyncResult<TicketDetail, unknown>
): TicketDetail | null =>
  AsyncResult.isFailure(result) &&
  Cause.findErrorOption(result.cause).pipe(
    Option.exists(Schema.is(NotFound))
  ) &&
  Option.isSome(result.previousSuccess)
    ? result.previousSuccess.value.value
    : null

export const ticketBodyDraft = Atom.family((_req: TicketRequest) =>
  Atom.make<string | null>(null).pipe(Atom.setIdleTTL("10 minutes"))
)

const publishFor = (req: TicketRequest, patch: TicketEdit) => {
  const scope = scopeOf(req)
  const fields = Object.keys(patch)
  const contentOnly = fields.every((f) => f === "title" || f === "body")
  const own = Keys.ticket(scope, req.params.id)
  if (!contentOnly) return [...Keys.ticketsChanged(scope), own]
  const keys = [Keys.ticketsIn(scope), own]
  if (patch.title !== undefined) {
    keys.push(Keys.ticketTitleQuery(scope))
  }
  return keys
}

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  coalescingTicketUpdate(ticketDetail(req), {
    name: "updateTicketDetail",
    path: req.params,
    idleTTL: "10 minutes",
    predict: applyTicketDetailPatch,
    confirm: (_ticket, { ticket }) => ticket,
    publish: (patch) => publishFor(req, patch)
  })
)

const archiveOnServer = (req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "archiveTicket",
    predict: (ticket, _input: ArchiveTicketInput) =>
      ticket.archivedAt === null
        ? { ...ticket, archivedAt: DateTime.toDate(DateTime.nowUnsafe()) }
        : ticket,
    call: (client, input) =>
      client.tickets.archive({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })

export const archiveTicket = Atom.family((req: TicketRequest) =>
  localFirst(req.params, archiveOnServer(req), (input: ArchiveTicketInput) => [
    archiveEdit(req.params.id, input, DateTime.toDate(DateTime.nowUnsafe()))
  ])
)

export const markTicket = Atom.family((req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "markTicket",
    predict: (ticket, _input: MarkTicketInput) => ticket,
    call: (client, input) =>
      client.tickets.mark({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: (_ticket, input) => [
      ...Keys.ticketsChanged(scopeOf(req)),
      Keys.ticket(scopeOf(req), input.target)
    ]
  })
)

export const unmarkTicket = Atom.family((req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "unmarkTicket",
    predict: (ticket, input: MarkTicketInput) => ({
      ...ticket,
      relations: withoutRelation(ticket.relations, input)
    }),
    call: (client, input) =>
      client.tickets.unmark({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: (_ticket, input) => [
      ...Keys.ticketsChanged(scopeOf(req)),
      Keys.ticket(scopeOf(req), input.target)
    ]
  })
)

const unarchiveOnServer = (req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "unarchiveTicket",
    predict: (ticket, _input: void) => ({ ...ticket, archivedAt: null }),
    call: (client) => client.tickets.unarchive({ params: req.params }),
    confirm: replaceWith,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })

export const unarchiveTicket = Atom.family((req: TicketRequest) =>
  localFirst(req.params, unarchiveOnServer(req), (_input: void) => [
    restoreEdit(req.params.id)
  ])
)

const deleteOnServer = (req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("deleteTicket")(function* (query: DeleteTicketQuery) {
      yield* Api.use((client) =>
        client.tickets.delete({ params: req.params, query })
      )
      yield* Reactivity.invalidate(Keys.ticketsChanged(scopeOf(req)))
    })
  )

export const deleteTicket = Atom.family((req: TicketRequest) =>
  localFirst(req.params, deleteOnServer(req), (query: DeleteTicketQuery) => [
    deleteEdit({
      tickets: [req.params.id],
      cascadeSubTickets: query.cascadeSubTickets
    })
  ])
)

export const moveTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("moveTicket")(function* (input: MoveTicketInput) {
      const result = yield* Api.use((client) =>
        client.tickets.move({ params: req.params, payload: input })
      )
      yield* Reactivity.invalidate([
        ...Keys.ticketChanged(scopeOf(req), req.params.id),
        Keys.sprintMembership(scopeOf(req)),
        ...Keys.ticketsChanged(
          projectScope(req.params.orgSlug, result.projectSlug)
        )
      ])
      return result
    })
  )
)

export const splitTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("splitTicket")(function* (input: SplitTicketInput) {
      const result = yield* Api.use((client) =>
        client.tickets.split({
          params: req.params,
          payload: input
        })
      )
      yield* Reactivity.invalidate([
        ...Keys.ticketChanged(scopeOf(req), req.params.id),
        Keys.sprintMembership(scopeOf(req))
      ])
      return result
    })
  )
)
