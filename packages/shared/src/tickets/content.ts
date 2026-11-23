import * as Schema from "effect/Schema"

import { Comment } from "../comments/Comment"
import { TicketListPage } from "../filters/Ticket"
import { TicketSubscribers } from "../subscriptions/TicketSubscribers"
import { TicketDetail, TicketId } from "./Ticket"
import { TicketActivityPage } from "./TicketActivity"

export const TICKET_CONTENT_BATCH_LIMIT = 100

export const TicketContentKind = Schema.Literals([
  "Detail",
  "Comments",
  "Activity",
  "Subscribers",
  "Children"
])
export type TicketContentKind = typeof TicketContentKind.Type

export const TicketContentKinds = TicketContentKind.literals

export const TicketContent = Schema.Union([
  Schema.TaggedStruct("Detail", { value: TicketDetail }),
  Schema.TaggedStruct("Comments", { value: Schema.Array(Comment) }),
  Schema.TaggedStruct("Activity", { value: TicketActivityPage }),
  Schema.TaggedStruct("Subscribers", { value: TicketSubscribers }),
  Schema.TaggedStruct("Children", { value: TicketListPage })
]).pipe(Schema.toTaggedUnion("_tag"))
export type TicketContent = typeof TicketContent.Type

export const TicketContentRequest = Schema.Struct({
  ids: Schema.Array(TicketId).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(TICKET_CONTENT_BATCH_LIMIT)
  ),
  kinds: Schema.Array(TicketContentKind).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(TicketContentKinds.length)
  )
})
export type TicketContentRequest = typeof TicketContentRequest.Type

export const TicketContentLine = Schema.Union([
  Schema.TaggedStruct("Found", { id: TicketId, content: TicketContent }),
  Schema.TaggedStruct("Missing", { id: TicketId, kind: TicketContentKind })
]).pipe(Schema.toTaggedUnion("_tag"))
export type TicketContentLine = typeof TicketContentLine.Type
