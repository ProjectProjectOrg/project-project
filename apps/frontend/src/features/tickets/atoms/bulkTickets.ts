import { PendingWrite } from "@pp/local"
import {
  BULK_TICKETS_MAX,
  type BulkArchiveTicketsInput,
  type BulkDeleteTicketsInput,
  type BulkUpdateTicketsInput,
  type TicketId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import { type LocalEdit, localFirst } from "@/features/local/atoms/localEdit"
import {
  bulkArchiveEdit,
  deleteEdit,
  intentsOf
} from "@/features/local/lib/localIntents"
import { fromBulkPatch } from "@/features/tickets/lib/ticketPatch"

export type BulkTicketsRequest = Readonly<{ orgSlug: string; slug: string }>

export const bulkBatches = (
  tickets: ReadonlyArray<TicketId>
): ReadonlyArray<ReadonlyArray<TicketId>> =>
  Array.from({ length: Math.ceil(tickets.length / BULK_TICKETS_MAX) }, (_, i) =>
    tickets.slice(i * BULK_TICKETS_MAX, (i + 1) * BULK_TICKETS_MAX)
  )

export const bulkChangedKeys = (
  req: BulkTicketsRequest,
  tickets: ReadonlyArray<TicketId>,
  sprintChanged: boolean
): ReadonlyArray<ReactivityKey> => {
  const scope = projectScope(req.orgSlug, req.slug)
  return [
    ...Keys.ticketsChanged(scope),
    Keys.sprintMembership(scope),
    ...(sprintChanged ? [Keys.sprints(scope)] : []),
    ...tickets.map((id) => Keys.ticket(scope, id))
  ]
}

export const bulkEdits = (
  input: BulkUpdateTicketsInput
): ReadonlyArray<LocalEdit> => {
  const edit = fromBulkPatch(input.patch)
  const intents = intentsOf(
    input.patch.sprint === undefined
      ? edit
      : { ...edit, sprint: input.patch.sprint }
  )
  return bulkBatches(input.tickets).map((tickets) => ({
    write: PendingWrite.cases.bulk.make({
      payload: { tickets, patch: input.patch }
    }),
    edits: tickets.map((ticket) => ({ ticket, intents }))
  }))
}

const bulkUpdateOnServer = (req: BulkTicketsRequest) =>
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

export const bulkUpdateTickets = Atom.family((req: BulkTicketsRequest) =>
  localFirst(req, bulkUpdateOnServer(req), bulkEdits)
)

const bulkArchiveOnServer = (req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkArchiveTickets")(function* (input: BulkArchiveTicketsInput) {
      return yield* Effect.forEach(bulkBatches(input.tickets), (tickets) =>
        Api.use((client) =>
          client.tickets.bulkArchive({
            params: req,
            payload: { ...input, tickets }
          })
        )
      ).pipe(
        Effect.ensuring(
          Reactivity.invalidate(bulkChangedKeys(req, input.tickets, false))
        )
      )
    })
  )

export const bulkArchiveTickets = Atom.family((req: BulkTicketsRequest) =>
  localFirst(req, bulkArchiveOnServer(req), (input: BulkArchiveTicketsInput) =>
    bulkBatches(input.tickets).map((tickets) =>
      bulkArchiveEdit(
        { ...input, tickets },
        DateTime.toDate(DateTime.nowUnsafe())
      )
    )
  )
)

const bulkDeleteOnServer = (req: BulkTicketsRequest) =>
  Api.runtime.fn(
    Effect.fn("bulkDeleteTickets")(function* (input: BulkDeleteTicketsInput) {
      return yield* Effect.forEach(bulkBatches(input.tickets), (tickets) =>
        Api.use((client) =>
          client.tickets.bulkDelete({
            params: req,
            payload: { ...input, tickets }
          })
        )
      ).pipe(
        Effect.ensuring(
          Reactivity.invalidate(bulkChangedKeys(req, input.tickets, true))
        )
      )
    })
  )

export const bulkDeleteTickets = Atom.family((req: BulkTicketsRequest) =>
  localFirst(req, bulkDeleteOnServer(req), (input: BulkDeleteTicketsInput) =>
    bulkBatches(input.tickets).map((tickets) =>
      deleteEdit({ ...input, tickets })
    )
  )
)
