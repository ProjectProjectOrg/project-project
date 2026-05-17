import * as Schema from "effect/Schema"
import { TicketStatus, TicketType } from "../../schemas/Ticket"
import { TagName } from "../../schemas/Tag"
import { GroupId } from "../../schemas/Group"

export const TicketFilter = Schema.Struct({
  status: Schema.optional(Schema.Array(TicketStatus)),
  type: Schema.optional(Schema.Array(TicketType)),
  // null encodes "unassigned"; non-null strings are user ids.
  assignee: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  tags: Schema.optional(Schema.Array(TagName)),
  hasBranch: Schema.optional(Schema.Boolean),
  hasPr: Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.Date),
  groupId: Schema.optional(Schema.Array(GroupId))
})
export type TicketFilter = typeof TicketFilter.Type
