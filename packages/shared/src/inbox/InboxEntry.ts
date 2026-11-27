import * as Schema from "effect/Schema"

import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"
import { TicketActivityActor } from "../tickets/TicketActivity"
import {
  InboxClearedBy,
  InboxEntryKind,
  InboxEntryState,
  InboxEvent
} from "./InboxEvent"

export const InboxEntryId = Schema.String.pipe(Schema.brand("InboxEntryId"))
export type InboxEntryId = typeof InboxEntryId.Type

export const InboxRevision = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

export const ExcerptPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("mention"),
    userId: Schema.String,
    handle: Schema.String
  })
])
export type ExcerptPart = typeof ExcerptPart.Type

export const InboxEntry = Schema.Struct({
  id: InboxEntryId,
  revision: InboxRevision,
  kind: InboxEntryKind,
  state: InboxEntryState,
  clearedBy: Schema.NullOr(InboxClearedBy),
  ticket: Schema.Struct({
    id: TicketId,
    title: Schema.String,
    projectSlug: Slug
  }),
  actor: Schema.NullOr(TicketActivityActor),
  latest: InboxEvent,
  latestAt: Schema.DateFromString,
  commentId: Schema.NullOr(Schema.String),
  excerpt: Schema.NullOr(Schema.Array(ExcerptPart)),
  eventCount: Schema.Int,
  readByClientName: Schema.NullOr(Schema.String)
})
export type InboxEntry = typeof InboxEntry.Type

export const InboxEntryStatus = Schema.Struct({
  id: InboxEntryId,
  state: InboxEntryState,
  clearedBy: Schema.NullOr(InboxClearedBy),
  revision: InboxRevision
})
export type InboxEntryStatus = typeof InboxEntryStatus.Type

export const InboxListScope = Schema.Literals(["active", "unread", "all"])
export type InboxListScope = typeof InboxListScope.Type

export const InboxListQuery = Schema.Struct({
  since: Schema.optional(Schema.DateFromString),
  state: Schema.optional(InboxListScope),
  before: Schema.optional(Schema.DateFromString),
  beforeId: Schema.optional(InboxEntryId),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.decodeTo(
        Schema.Int.pipe(
          Schema.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))
        )
      )
    )
  )
})

export const InboxRevisionQuery = Schema.Struct({
  revision: Schema.NumberFromString.pipe(Schema.decodeTo(InboxRevision))
})

export const InboxRevisionPayload = Schema.Struct({ revision: InboxRevision })

export const InboxReadAllPayload = Schema.Struct({
  upTo: Schema.DateFromString
})

export const InboxReadAllResult = Schema.Struct({ cleared: Schema.Int })

export const InboxCount = Schema.Struct({ unread: Schema.Int })
