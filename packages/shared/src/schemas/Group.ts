import * as Schema from "effect/Schema"

import { GroupId } from "./GroupId"
import { TicketId, TicketStatus } from "./Ticket"

export { GroupId }

export const GroupKind = Schema.Literals([
  "sprint",
  "epic",
  "milestone",
  "other"
])
export type GroupKind = typeof GroupKind.Type

export const GroupColor = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u)),
  Schema.brand("GroupColor")
)
export type GroupColor = typeof GroupColor.Type

export const Group = Schema.Struct({
  id: GroupId,
  name: Schema.String,
  kind: GroupKind,
  tickets: Schema.Array(TicketId),
  color: GroupColor,
  startsAt: Schema.NullOr(Schema.DateFromString),
  endsAt: Schema.NullOr(Schema.DateFromString),
  completedAt: Schema.NullOr(Schema.DateFromString),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString
})
export type Group = typeof Group.Type

export const GroupDetail = Schema.Struct({
  ...Group.fields,
  body: Schema.String
})
export type GroupDetail = typeof GroupDetail.Type

const groupFieldDocs = {
  color: "A `#RRGGBB` colour.",
  startsAt: "The start date, ISO 8601, or `null` for none.",
  endsAt: "The end date, ISO 8601, or `null` for none."
} as const

export const CreateGroupInput = Schema.Struct({
  name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(200))
  ).annotate({
    description: "The name, 1 to 200 characters."
  }),
  kind: Schema.optional(GroupKind),
  color: Schema.optional(GroupColor).annotate({
    description: groupFieldDocs.color
  }),
  startsAt: Schema.optional(Schema.NullOr(Schema.DateFromString)).annotate({
    description: groupFieldDocs.startsAt
  }),
  endsAt: Schema.optional(Schema.NullOr(Schema.DateFromString)).annotate({
    description: groupFieldDocs.endsAt
  }),
  tickets: Schema.optional(Schema.Array(TicketId)).annotate({
    description:
      "Ticket ids to add on creation; sprint membership is exclusive, so they leave any other sprint."
  })
})
export type CreateGroupInput = typeof CreateGroupInput.Type

export const UpdateGroupInput = Schema.Struct({
  name: Schema.optional(
    Schema.String.pipe(
      Schema.check(Schema.isMinLength(1)),
      Schema.check(Schema.isMaxLength(200))
    )
  ).annotate({ description: "A new name, 1 to 200 characters." }),
  body: Schema.optional(Schema.String).annotate({
    description: "The markdown description; replaces the whole body."
  }),
  color: Schema.optional(GroupColor).annotate({
    description: groupFieldDocs.color
  }),
  startsAt: Schema.optional(Schema.NullOr(Schema.DateFromString)).annotate({
    description: groupFieldDocs.startsAt
  }),
  endsAt: Schema.optional(Schema.NullOr(Schema.DateFromString)).annotate({
    description: groupFieldDocs.endsAt
  }),
  completedAt: Schema.optional(Schema.NullOr(Schema.DateFromString))
})
export type UpdateGroupInput = typeof UpdateGroupInput.Type

export const UpdateGroupTicketsInput = Schema.Struct({
  tickets: Schema.Array(TicketId)
})
export type UpdateGroupTicketsInput = typeof UpdateGroupTicketsInput.Type

export const EvictedFromGroup = Schema.Struct({
  groupId: GroupId,
  ticketIds: Schema.Array(TicketId)
})
export type EvictedFromGroup = typeof EvictedFromGroup.Type

export const UpdateGroupTicketsOutput = Schema.Struct({
  target: GroupDetail,
  evicted: Schema.Array(EvictedFromGroup)
})
export type UpdateGroupTicketsOutput = typeof UpdateGroupTicketsOutput.Type

export const UpdateTicketOrderInput = Schema.Struct({
  ticketId: TicketId,
  status: Schema.optional(TicketStatus),
  after: Schema.NullOr(TicketId)
})
export type UpdateTicketOrderInput = typeof UpdateTicketOrderInput.Type

export const CompleteSprintDestination = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("sprint"), groupId: GroupId }),
  Schema.Struct({ kind: Schema.Literal("backlog") })
])
export type CompleteSprintDestination = typeof CompleteSprintDestination.Type

export const CompleteSprintInput = Schema.Struct({
  destination: CompleteSprintDestination.annotate({
    description:
      'Where unfinished tickets go: `{ kind: "sprint", groupId: "G-N" }` or `{ kind: "backlog" }`.'
  })
})
export type CompleteSprintInput = typeof CompleteSprintInput.Type

export const CompleteSprintOutput = Schema.Struct({
  target: GroupDetail,
  carried: Schema.Array(TicketId)
})
export type CompleteSprintOutput = typeof CompleteSprintOutput.Type
