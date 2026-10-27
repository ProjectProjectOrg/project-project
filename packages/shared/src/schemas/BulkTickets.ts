import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

import { UpdateGroupTicketsOutput } from "./Group"
import { GroupId } from "./GroupId"
import { Ticket, TicketId, UpdateTicketInput } from "./Ticket"

export const BULK_TICKETS_MAX = 200

export const BulkTicketPatch = Schema.Struct({
  ...Struct.omit(UpdateTicketInput.fields, ["title", "body"]),
  sprint: Schema.optional(Schema.NullOr(GroupId))
})
export type BulkTicketPatch = typeof BulkTicketPatch.Type

export const BulkUpdateTicketsInput = Schema.Struct({
  tickets: Schema.Array(TicketId).pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(BULK_TICKETS_MAX))
  ),
  patch: BulkTicketPatch
})
export type BulkUpdateTicketsInput = typeof BulkUpdateTicketsInput.Type

export const BulkUpdateTicketsResult = Schema.Struct({
  tickets: Schema.Array(Ticket),
  sprint: Schema.NullOr(UpdateGroupTicketsOutput)
})
export type BulkUpdateTicketsResult = typeof BulkUpdateTicketsResult.Type
