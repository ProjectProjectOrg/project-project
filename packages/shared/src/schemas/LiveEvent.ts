import * as Schema from "effect/Schema"

import { GroupId } from "./GroupId"
import { Slug } from "./Project"
import { TicketId } from "./Ticket"

export const LiveCursor = Schema.String
export type LiveCursor = typeof LiveCursor.Type

const changeIn = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct({
    orgSlug: Slug,
    slug: Slug,
    origin: Schema.NullOr(Schema.String),
    cursor: LiveCursor,
    ...fields
  })

export const TicketChanged = changeIn({
  kind: Schema.Literal("ticket"),
  id: TicketId
})
export type TicketChanged = typeof TicketChanged.Type

export const TicketsChanged = changeIn({
  kind: Schema.Literal("tickets")
})
export type TicketsChanged = typeof TicketsChanged.Type

export const CommentsChanged = changeIn({
  kind: Schema.Literal("comments"),
  ticketId: TicketId
})
export type CommentsChanged = typeof CommentsChanged.Type

export const GroupChanged = changeIn({
  kind: Schema.Literal("group"),
  id: GroupId
})
export type GroupChanged = typeof GroupChanged.Type

export const LiveChange = Schema.Union([
  TicketChanged,
  TicketsChanged,
  CommentsChanged,
  GroupChanged
])
export type LiveChange = typeof LiveChange.Type

export const LiveHeartbeat = Schema.Struct({
  kind: Schema.Literal("heartbeat"),
  cursor: LiveCursor
})
export type LiveHeartbeat = typeof LiveHeartbeat.Type

export const LiveResync = Schema.Struct({
  kind: Schema.Literal("resync"),
  cursor: LiveCursor
})
export type LiveResync = typeof LiveResync.Type

export const LiveEvent = Schema.Union([LiveChange, LiveHeartbeat, LiveResync])
export type LiveEvent = typeof LiveEvent.Type

export const LiveEventsQuery = Schema.Struct({
  after: Schema.optional(LiveCursor)
})
export type LiveEventsQuery = typeof LiveEventsQuery.Type

export const LIVE_ORIGIN_HEADER = "x-pp-client"
