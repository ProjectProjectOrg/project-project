import * as Schema from "effect/Schema"
import { TicketId } from "./Ticket"
import { GroupId } from "./Group"

export const WorkTypeOption = Schema.Struct({
  key: Schema.String,
  label: Schema.String
})
export type WorkTypeOption = typeof WorkTypeOption.Type

export const StartTimerInput = Schema.Struct({
  workTypeKey: Schema.String.pipe(Schema.minLength(1)),
  comment: Schema.optional(Schema.String)
})
export type StartTimerInput = typeof StartTimerInput.Type

export const StartSprintTimerInput = Schema.Struct({
  workTypeKey: Schema.String.pipe(Schema.minLength(1)),
  comment: Schema.optional(Schema.String)
})
export type StartSprintTimerInput = typeof StartSprintTimerInput.Type

export const LogTimeInput = Schema.Struct({
  workTypeKey: Schema.String.pipe(Schema.minLength(1)),
  seconds: Schema.Number.pipe(Schema.int(), Schema.positive()),
  date: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/)),
  comment: Schema.optional(Schema.String),
  ticketId: Schema.optional(Schema.NullOr(TicketId)),
  groupId: Schema.optional(Schema.NullOr(GroupId))
})
export type LogTimeInput = typeof LogTimeInput.Type

export const ActiveTimer = Schema.Struct({
  ticketId: Schema.NullOr(TicketId),
  ticketTitle: Schema.NullOr(Schema.String),
  groupId: GroupId,
  workTypeKey: Schema.String,
  workTypeLabel: Schema.String,
  everhourTaskId: Schema.String,
  startedAt: Schema.Date
})
export type ActiveTimer = typeof ActiveTimer.Type

export const TicketTimeSummary = Schema.Struct({
  ticketId: TicketId,
  totalSeconds: Schema.Number,
  userSeconds: Schema.Number
})
export type TicketTimeSummary = typeof TicketTimeSummary.Type
