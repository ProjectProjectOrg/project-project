import * as Schema from "effect/Schema"

import { UserId } from "../auth/User"
import { TicketId, TicketStatus } from "../tickets/Ticket"

export const InboxEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("assigned") }),
  Schema.Struct({
    kind: Schema.Literal("mentioned"),
    commentId: Schema.NullOr(Schema.String)
  }),
  Schema.Struct({
    kind: Schema.Literal("commented"),
    commentId: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("status_changed"),
    from: TicketStatus,
    to: TicketStatus
  }),
  Schema.Struct({ kind: Schema.Literal("unblocked"), by: TicketId }),
  Schema.Struct({ kind: Schema.Literal("archived") }),
  Schema.Struct({
    kind: Schema.Literal("moved"),
    fromProject: Schema.String,
    fromId: TicketId
  }),
  Schema.Struct({
    kind: Schema.Literal("split"),
    into: Schema.Array(TicketId)
  }),
  Schema.Struct({
    kind: Schema.Literal("reassigned"),
    added: Schema.Array(UserId),
    removed: Schema.Array(UserId)
  })
])
export type InboxEvent = typeof InboxEvent.Type
export type InboxEventEncoded = typeof InboxEvent.Encoded

export const InboxEntryKind = Schema.Literals([
  "assigned",
  "mentioned",
  "updates"
])
export type InboxEntryKind = typeof InboxEntryKind.Type

export const InboxEntryState = Schema.Literals(["unread", "read", "cleared"])
export type InboxEntryState = typeof InboxEntryState.Type

export const InboxClearedBy = Schema.Literals([
  "read",
  "replied",
  "deleted",
  "unassigned",
  "finished"
])
export type InboxClearedBy = typeof InboxClearedBy.Type
