import type {
  ArchiveTicketInput,
  SplitTicketInput,
  TicketId,
  UpdateTicketInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

import { applyTicketDetailPatch } from "../lib/ticketPatch"
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
  Api.query("tickets", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug),
      Keys.orgLibrary(req.params.orgSlug),
      Keys.projectLibrary(scopeOf(req))
    ]
  })

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
  if (!contentOnly) return Keys.ticketsChanged(scope)
  const keys = [Keys.ticketUpdatedQuery(scope), Keys.ticketsIn(scope)]
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

export const archiveTicket = Atom.family((req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "archiveTicket",
    predict: (ticket, _input: ArchiveTicketInput) =>
      ticket.archivedAt === null
        ? { ...ticket, archivedAt: DateTime.toDate(DateTime.nowUnsafe()) }
        : ticket,
    call: (input) =>
      Api.use((client) =>
        client.tickets.archive({ params: req.params, payload: input })
      ),
    confirm: replaceWith,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })
)

export const unarchiveTicket = Atom.family((req: TicketRequest) =>
  viewMutation(ticketDetail(req), {
    name: "unarchiveTicket",
    predict: (ticket, _input: void) => ({ ...ticket, archivedAt: null }),
    call: () =>
      Api.use((client) => client.tickets.unarchive({ params: req.params })),
    confirm: replaceWith,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })
)

export const deleteTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn("deleteTicket")(function* (_input: void) {
      yield* Api.use((client) => client.tickets.delete({ params: req.params }))
      yield* Reactivity.invalidate(Keys.ticketsChanged(scopeOf(req)))
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
