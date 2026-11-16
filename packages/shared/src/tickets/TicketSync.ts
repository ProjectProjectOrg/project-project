import * as Schema from "effect/Schema"

import { LiveCursor } from "../live/LiveEvent"
import { Ticket, TicketId } from "./Ticket"

export const TicketSyncQuery = Schema.Struct({
  after: Schema.optional(LiveCursor),
  ids: Schema.optional(Schema.String)
})
export type TicketSyncQuery = typeof TicketSyncQuery.Type

export const TicketSync = Schema.Struct({
  mode: Schema.Union([Schema.Literal("full"), Schema.Literal("delta")]),
  rows: Schema.Array(Ticket),
  removed: Schema.Array(TicketId),
  cursor: LiveCursor
})
export type TicketSync = typeof TicketSync.Type
