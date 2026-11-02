import * as Schema from "effect/Schema"

import { GroupId } from "./GroupId"
import { TicketId, TicketStatus, TicketType } from "./Ticket"

export const ProjectEventKind = Schema.Literals([
  "ticket_created",
  "ticket_completed",
  "ticket_reopened",
  "ticket_status_changed",
  "ticket_assignees_changed",
  "sprint_created",
  "sprint_renamed",
  "sprint_started",
  "sprint_completed",
  "sprint_reopened",
  "sprint_deleted"
])
export type ProjectEventKind = typeof ProjectEventKind.Type

const ticketFields = {
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: Schema.optionalKey(TicketType)
}

export const TicketEvent = Schema.Struct({
  kind: Schema.Literals([
    "ticket_created",
    "ticket_completed",
    "ticket_reopened"
  ]),
  ...ticketFields
})

export const TicketStatusChangedEvent = Schema.Struct({
  kind: Schema.Literal("ticket_status_changed"),
  ...ticketFields,
  previousStatus: TicketStatus
})

export const TicketAssigneesChangedEvent = Schema.Struct({
  kind: Schema.Literal("ticket_assignees_changed"),
  ...ticketFields,
  assignees: Schema.Array(Schema.String),
  added: Schema.Array(Schema.String),
  removed: Schema.Array(Schema.String)
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

export const ProjectEvent = Schema.Union([
  TicketEvent,
  TicketStatusChangedEvent,
  TicketAssigneesChangedEvent,
  SprintEvent
])
export type ProjectEvent = typeof ProjectEvent.Type
