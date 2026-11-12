import type {
  BulkArchiveTicketsInput,
  BulkDeleteTicketsInput,
  BulkUpdateTicketsInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type BulkTicketsRequest = Readonly<{ orgSlug: string; slug: string }>

export const bulkUpdateTickets = Atom.family((req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkUpdateTickets")(function* (input: BulkUpdateTicketsInput) {
      const result = yield* Api.use((client) =>
        client.tickets.bulkUpdate({ params: req, payload: input })
      )
      const scope = projectScope(req.orgSlug, req.slug)
      yield* Reactivity.invalidate([
        ...Keys.ticketsChanged(scope),
        Keys.sprintMembership(scope),
        ...input.tickets.map((id) => Keys.ticket(scope, id))
      ])
      return result
    })
  )
)

export const bulkArchiveTickets = Atom.family((req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkArchiveTickets")(function* (input: BulkArchiveTicketsInput) {
      const result = yield* Api.use((client) =>
        client.tickets.bulkArchive({ params: req, payload: input })
      )
      yield* Reactivity.invalidate(
        Keys.ticketsChanged(projectScope(req.orgSlug, req.slug))
      )
      return result
    })
  )
)

export const bulkDeleteTickets = Atom.family((req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkDeleteTickets")(function* (input: BulkDeleteTicketsInput) {
      const result = yield* Api.use((client) =>
        client.tickets.bulkDelete({ params: req, payload: input })
      )
      yield* Reactivity.invalidate(
        Keys.ticketsChanged(projectScope(req.orgSlug, req.slug))
      )
      return result
    })
  )
)
