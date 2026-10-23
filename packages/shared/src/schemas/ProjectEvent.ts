import * as Schema from "effect/Schema"

import { GroupId } from "./GroupId"
import { TicketId, TicketStatus } from "./Ticket"

export const ProjectEventKind = Schema.Literals([
  "ticket_created",
  "ticket_completed",
  "ticket_reopened",
  "sprint_created",
  "sprint_renamed",
  "sprint_started",
  "sprint_completed",
  "sprint_reopened",
  "sprint_deleted"
])
export type ProjectEventKind = typeof ProjectEventKind.Type

export const TicketEvent = Schema.Struct({
  kind: Schema.Literals([
    "ticket_created",
    "ticket_completed",
    "ticket_reopened"
  ]),
  id: TicketId,
  title: Schema.String,
  status: TicketStatus
})

export const SprintEvent = Schema.Struct({
  kind: Schema.Literals([
    "sprint_created",
    "sprint_renamed",
    "sprint_started",
    "sprint_completed",
    "sprint_reopened",
    "sprint_deleted"
  ]),
  id: GroupId,
  title: Schema.String,
  startsAt: Schema.NullOr(Schema.DateFromString)
})

export const ProjectEvent = Schema.Union([TicketEvent, SprintEvent])
export type ProjectEvent = typeof ProjectEvent.Type
