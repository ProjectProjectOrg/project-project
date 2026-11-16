import * as Schema from "effect/Schema"

import { Slug } from "../projects/Project"
import { TicketId, TicketStatus } from "../tickets/Ticket"
import { TicketActivityActor } from "../tickets/TicketActivity"
import { DirectReason, InboxEvent } from "./InboxEvent"

export const InboxItem = Schema.Struct({
  projectSlug: Slug,
  ticket: Schema.Struct({
    id: TicketId,
    title: Schema.String,
    status: TicketStatus,
    archived: Schema.Boolean
  }),
  unread: Schema.Boolean,
  direct: Schema.Array(DirectReason),
  latest: InboxEvent,
  latestAt: Schema.DateFromString,
  firstAt: Schema.DateFromString,
  actor: Schema.NullOr(TicketActivityActor),
  unreadCount: Schema.Finite,
  lastReadAt: Schema.NullOr(Schema.DateFromString)
})
export type InboxItem = typeof InboxItem.Type

export const InboxListQuery = Schema.Struct({
  readSince: Schema.optional(Schema.DateFromString)
})
export type InboxListQuery = typeof InboxListQuery.Type

export const InboxUnread = Schema.Struct({ count: Schema.Finite })
export type InboxUnread = typeof InboxUnread.Type
