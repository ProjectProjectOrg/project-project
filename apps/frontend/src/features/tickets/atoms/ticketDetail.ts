import type {
  ArchiveTicketInput,
  MoveTicketInput,
  MarkTicketInput,
  LinkedTicket,
  SplitTicketInput,
  TicketId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { replaceWith, viewMutation } from "@/api/viewMutation"

import {
  withRelation,
  withoutRelation,
  type AddRelation
} from "../lib/relationGroups"
import { ticketContentKey } from "../lib/ticketContent"
import { applyTicketDetailPatch } from "../lib/ticketPatch"
import { parentKeys } from "./bulkTickets"
import { coalescingTicketUpdate } from "./ticketRows"

export type TicketRequest = ReturnType<typeof ticketRequest>

export const ticketRequest = (orgSlug: string, slug: string, id: TicketId) =>
  ({
    _view: "ticketDetail",
    params: { orgSlug, slug, id }
  }) as const

const scopeOf = (req: TicketRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const ticketQuery = (req: TicketRequest) =>
  query("tickets", "get", {
    params: req.params,
    serializationKey: ticketContentKey(req.params),
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.projectResync(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug),
      Keys.orgLibrary(req.params.orgSlug),
      Keys.projectLibrary(scopeOf(req))
    ]
  })

export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketQuery(req))
)

const movedTicketQuery = (req: TicketRequest) =>
  query("tickets", "movedTo", {
    params: req.params,
    reactivityKeys: [Keys.ticket(scopeOf(req), req.params.id)]
  })

export const movedTicket = Atom.family((req: TicketRequest) =>
  Atom.optimistic(movedTicketQuery(req))
)

export const ticketBodyDraft = Atom.family((_req: TicketRequest) =>
  Atom.make<string | null>(null).pipe(Atom.setIdleTTL("10 minutes"))
)

export const ticketReadEditFailed = Atom.family((_req: TicketRequest) =>
  Atom.make(false).pipe(Atom.setIdleTTL("10 minutes"))
)

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  coalescingTicketUpdate(ticketDetail(req), {
    name: "updateTicketDetail",
    path: req.params,
    idleTTL: "10 minutes",
    predict: applyTicketDetailPatch,
    confirm: (_ticket, { ticket }) => ticket
  })
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
    publish: (ticket) => [
      ...Keys.ticketChanged(scopeOf(req), req.params.id),
      Keys.pins(req.params.orgSlug),
      ...parentKeys(scopeOf(req), [ticket])
    ]
  })
)

export const markDuplicate = (req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "markDuplicate",
    predict: (
      ticket,
      {
        duplicate,
        original
      }: Readonly<{ duplicate: LinkedTicket; original: LinkedTicket }>
    ) => {
      const archivedAt = DateTime.toDate(DateTime.nowUnsafe())
      if (ticket.id === duplicate.id)
        return {
          ...ticket,
          archivedAt,
          relations: { ...ticket.relations, duplicateOf: original }
        }
      const relations = withRelation(ticket.relations, {
        kind: "duplicates",
        target: { ...duplicate, archivedAt }
      })
      return {
        ...ticket,
        relations,
        duplicateCount: relations.duplicates.length
      }
    },
    call: (client, { duplicate, original }) =>
      client.tickets.archive({
        params: { ...req.params, id: duplicate.id },
        payload: { duplicateOf: original.id }
      }),
    confirm: (current, confirmed) =>
      current.id === confirmed.id ? confirmed : current,
    publish: (ticket, { original }) => [
      ...Keys.ticketChanged(scopeOf(req), ticket.id),
      Keys.ticket(scopeOf(req), original.id),
      Keys.pins(req.params.orgSlug),
      ...parentKeys(scopeOf(req), [ticket])
    ]
  })

export const markTicket = (req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "markTicket",
    predict: (ticket, input: AddRelation) => ({
      ...ticket,
      relations: withRelation(ticket.relations, input)
    }),
    call: (client, input) =>
      client.tickets.mark({
        params: req.params,
        payload: { kind: input.kind, target: input.target.id }
      }),
    confirm: replaceWith,
    publish: (_result, input) => [
      ...Keys.ticketChanged(scopeOf(req), req.params.id),
      Keys.ticket(scopeOf(req), input.target.id)
    ]
  })

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
    publish: (_result, input) => [
      ...Keys.ticketChanged(scopeOf(req), req.params.id),
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
    publish: (ticket) => [
      ...Keys.ticketChanged(scopeOf(req), req.params.id),
      Keys.pins(req.params.orgSlug),
      ...parentKeys(scopeOf(req), [ticket])
    ]
  })
)

export const moveTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("moveTicket")(function* (input: MoveTicketInput) {
      const result = yield* Api.use((client) =>
        client.tickets.move({ params: req.params, payload: input })
      )
      yield* Reactivity.invalidate([
        ...result.moved.flatMap(({ from, to }) => [
          ...Keys.ticketChanged(scopeOf(req), from),
          ...Keys.ticketChanged(
            projectScope(req.params.orgSlug, result.projectSlug),
            to
          )
        ]),
        Keys.sprintMembership(scopeOf(req)),
        Keys.pins(req.params.orgSlug)
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
        ...result.created.map(({ id }) => Keys.ticket(scopeOf(req), id)),
        Keys.sprintMembership(scopeOf(req))
      ])
      return result
    })
  )
)
