import {
  BULK_TICKETS_MAX,
  type BulkUpdateTicketsInput,
  type TicketId,
  type TicketParent
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"

export type BulkTicketsRequest = Readonly<{ orgSlug: string; slug: string }>

export const bulkBatches = (tickets: ReadonlyArray<TicketId>) =>
  Array.from({ length: Math.ceil(tickets.length / BULK_TICKETS_MAX) }, (_, i) =>
    tickets.slice(i * BULK_TICKETS_MAX, (i + 1) * BULK_TICKETS_MAX)
  )

export const bulkChangedKeys = (
  req: BulkTicketsRequest,
  tickets: ReadonlyArray<TicketId>,
  sprintChanged: boolean
) => {
  const scope = projectScope(req.orgSlug, req.slug)
  return [
    Keys.ticketLists(scope),
    Keys.ticketPages(scope),
    Keys.ticketTitleQuery(scope),
    Keys.ticketUpdatedQuery(scope),
    Keys.sprintMembership(scope),
    ...(sprintChanged ? [Keys.sprints(scope)] : []),
    ...tickets.map((id) => Keys.ticket(scope, id)),
    Keys.pins(req.orgSlug)
  ] satisfies ReadonlyArray<ReactivityKey>
}

export const parentKeys = (
  scope: string,
  tickets: ReadonlyArray<Readonly<{ parent: TicketParent | null }>>
) =>
  [
    ...new Set(
      tickets.flatMap(({ parent }) => (parent === null ? [] : [parent.id]))
    )
  ].map((id) => Keys.ticket(scope, id))

export const bulkUpdateTickets = Atom.family((req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkUpdateTickets")(function* (input: BulkUpdateTicketsInput) {
      return yield* Effect.forEach(bulkBatches(input.tickets), (tickets) =>
        Api.use((client) =>
          client.tickets.bulkUpdate({
            params: req,
            payload: { tickets, patch: input.patch }
          })
        )
      ).pipe(
        Effect.tap((results) =>
          Reactivity.invalidate(
            parentKeys(
              projectScope(req.orgSlug, req.slug),
              results.flatMap((result) => result.tickets)
            )
          )
        ),
        Effect.ensuring(
          Reactivity.invalidate(
            bulkChangedKeys(
              req,
              input.tickets,
              input.patch.sprint !== undefined
            )
          )
        )
      )
    })
  )
)
