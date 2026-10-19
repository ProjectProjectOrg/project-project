import * as Schema from "effect/Schema"

import { GroupId } from "./GroupId"
import { TicketId, TicketStatus } from "./Ticket"

export const ProjectEventKind = Schema.Literals([
  "ticket_created",
  "ticket_completed",
  "ticket_reopened",
  "sprint_started",
  "sprint_completed"
])
export type ProjectEventKind = typeof ProjectEventKind.Type

export const ProjectEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals([
      "ticket_created",
      "ticket_completed",
      "ticket_reopened"
    ]),
    id: TicketId,
    title: Schema.String,
    status: TicketStatus
  }),
  Schema.Struct({
    kind: Schema.Literals(["sprint_started", "sprint_completed"]),
    id: GroupId,
    title: Schema.String,
    startsAt: Schema.NullOr(Schema.DateFromString)
  })
])
export type ProjectEvent = typeof ProjectEvent.Type
