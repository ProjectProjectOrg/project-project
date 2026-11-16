import {
  type ArchiveTicketInput,
  type DeleteTicketQuery,
  type MarkTicketInput,
  type MoveTicketInput,
  NotFound,
  type SplitTicketInput,
  type TicketDetail,
  type TicketId
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"
import { localTickets } from "@/features/local/atoms/localTickets"
import { decodeTicketRow } from "@/features/local/lib/ticketCollection"

import { withoutRelation } from "../lib/relationGroups"
import type { TicketEdit } from "../lib/ticketPatch"

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

export const ticketQuery = (req: TicketRequest) => {
  let reload = () => {}
  return Atom.readable(
    (get): AsyncResult.AsyncResult<TicketDetail, NotFound> => {
      const local = get(
        localTickets({ orgSlug: req.params.orgSlug, slug: req.params.slug })
      )
      if (!AsyncResult.isSuccess(local)) return AsyncResult.initial(true)
      const { collection, fetchOne } = local.value
      const id = req.params.id
      let last: AsyncResult.Success<TicketDetail, NotFound> | null = null
      const shown = (ticket: TicketDetail) => {
        last = AsyncResult.success(ticket)
        return last
      }
      const missing = () =>
        AsyncResult.fail(new NotFound(), {
          previousSuccess: Option.fromNullishOr(last)
        })
      const load = () =>
        fetchOne(id).then(
          (outcome) => {
            if (outcome._tag === "Missing") get.setSelf(missing())
          },
          (error: unknown) => get.setSelf(AsyncResult.failure(Cause.die(error)))
        )
      reload = () => void load()
      const subscription = collection.subscribeChanges((changes) => {
        if (!changes.some((change) => change.key === id)) return
        const row = collection.get(id)
        get.setSelf(row === undefined ? missing() : shown(decodeTicketRow(row)))
      })
      get.addFinalizer(() => subscription.unsubscribe())
      const row = collection.get(id)
      if (row !== undefined) return shown(decodeTicketRow(row))
      if (collection.isReady()) void load()
      else
        get.addFinalizer(
          collection.onFirstReady(() => {
            if (collection.get(id) === undefined) void load()
          })
        )
      return AsyncResult.initial(true)
    },
    () => reload()
  )
}

export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketQuery(req))
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
  const keys = [Keys.ticketUpdatedQuery(scope), Keys.ticketsIn(scope), own]
  if (patch.title !== undefined) {
    keys.push(Keys.ticketTitleQuery(scope))
  }
  return keys
}

export class TicketSaveFailed extends Data.TaggedError("TicketSaveFailed")<{
  cause: unknown
}> {}

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  Api.runtime
    .fn(
      Effect.fn("updateTicketDetail")(function* (
        edit: TicketEdit,
        get: Atom.FnContext
      ) {
        const local = yield* get.result(
          localTickets({ orgSlug: req.params.orgSlug, slug: req.params.slug })
        )
        const transaction = local.updateTicket({ id: req.params.id, edit })
        yield* Effect.tryPromise({
          try: () => transaction.when("settled"),
          catch: (cause) => new TicketSaveFailed({ cause })
        })
        yield* Reactivity.invalidate(publishFor(req, edit))
      })
    )
    .pipe(Atom.setIdleTTL("10 minutes"))
)

export const archiveTicket = Atom.family((req: TicketRequest) =>
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

export const unarchiveTicket = Atom.family((req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "unarchiveTicket",
    predict: (ticket, _input: void) => ({ ...ticket, archivedAt: null }),
    call: (client) => client.tickets.unarchive({ params: req.params }),
    confirm: replaceWith,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })
)

export const deleteTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("deleteTicket")(function* (query: DeleteTicketQuery) {
      yield* Api.use((client) =>
        client.tickets.delete({ params: req.params, query })
      )
      yield* Reactivity.invalidate(Keys.ticketsChanged(scopeOf(req)))
    })
  )
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
