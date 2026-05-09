import * as Schema from "effect/Schema"
import { TicketId } from "./Ticket"

export const GroupId = Schema.String.pipe(
  Schema.pattern(/^G-[1-9][0-9]*$/),
  Schema.brand("GroupId")
)
export type GroupId = typeof GroupId.Type

export const GroupKind = Schema.Literal("sprint", "epic", "milestone", "other")
export type GroupKind = typeof GroupKind.Type

export const ADMIN_GATED_KINDS: ReadonlySet<GroupKind> = new Set([
  "sprint",
  "milestone"
])

export const GroupColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i),
  Schema.brand("GroupColor")
)
export type GroupColor = typeof GroupColor.Type

export const Group = Schema.Struct({
  id: GroupId,
  name: Schema.String,
  kind: GroupKind,
  tickets: Schema.Array(TicketId),
  color: GroupColor,
  startsAt: Schema.NullOr(Schema.Date),
  endsAt: Schema.NullOr(Schema.Date),
  completedAt: Schema.NullOr(Schema.Date),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
export type Group = typeof Group.Type

export const GroupDetail = Schema.Struct({
  ...Group.fields,
  body: Schema.String
})
export type GroupDetail = typeof GroupDetail.Type

export const CreateGroupInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  kind: Schema.optional(GroupKind),
  color: Schema.optional(GroupColor),
  startsAt: Schema.optional(Schema.NullOr(Schema.Date)),
  endsAt: Schema.optional(Schema.NullOr(Schema.Date)),
  tickets: Schema.optional(Schema.Array(TicketId))
})
export type CreateGroupInput = typeof CreateGroupInput.Type

export const UpdateGroupInput = Schema.Struct({
  name: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200))
  ),
  body: Schema.optional(Schema.String),
  color: Schema.optional(GroupColor),
  startsAt: Schema.optional(Schema.NullOr(Schema.Date)),
  endsAt: Schema.optional(Schema.NullOr(Schema.Date)),
  completedAt: Schema.optional(Schema.NullOr(Schema.Date))
})
export type UpdateGroupInput = typeof UpdateGroupInput.Type

export const UpdateGroupTicketsInput = Schema.Struct({
  tickets: Schema.Array(TicketId)
})
export type UpdateGroupTicketsInput = typeof UpdateGroupTicketsInput.Type
