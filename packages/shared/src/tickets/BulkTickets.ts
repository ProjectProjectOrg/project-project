import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

import { UpdateGroupTicketsOutput } from "../groups/Group"
import { GroupId } from "../groups/GroupId"
import {
  ArchiveTicketInput,
  DeleteTicketQuery,
  Ticket,
  TicketId,
  UpdateTicketInput
} from "./Ticket"

export const BULK_TICKETS_MAX = 200

export const BulkTicketPatch = Schema.Struct({
  ...Struct.omit(UpdateTicketInput.fields, [
    "title",
    "body",
    "blockedBy",
    "relatedTo"
  ]),
  sprint: Schema.optional(Schema.NullOr(GroupId))
})
export type BulkTicketPatch = typeof BulkTicketPatch.Type

const BulkTicketIds = Schema.Array(TicketId).pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(BULK_TICKETS_MAX))
)

export const BulkUpdateTicketsInput = Schema.Struct({
  tickets: BulkTicketIds,
  patch: BulkTicketPatch
})
export type BulkUpdateTicketsInput = typeof BulkUpdateTicketsInput.Type

export const BulkUpdateTicketsResult = Schema.Struct({
  tickets: Schema.Array(Ticket),
  sprint: Schema.NullOr(UpdateGroupTicketsOutput)
})
export type BulkUpdateTicketsResult = typeof BulkUpdateTicketsResult.Type

export const BulkArchiveTicketsInput = Schema.Struct({
  tickets: BulkTicketIds,
  reason: ArchiveTicketInput.fields.reason
})
export type BulkArchiveTicketsInput = typeof BulkArchiveTicketsInput.Type

export const BulkDeleteTicketsInput = Schema.Struct({
  tickets: BulkTicketIds,
  cascadeSubTickets: DeleteTicketQuery.fields.cascadeSubTickets
})
export type BulkDeleteTicketsInput = typeof BulkDeleteTicketsInput.Type

export const BulkTicketsResult = Schema.Struct({
  tickets: Schema.Array(TicketId)
})
export type BulkTicketsResult = typeof BulkTicketsResult.Type
