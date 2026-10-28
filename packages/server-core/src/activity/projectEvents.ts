import type { ProjectEvent, SprintEvent } from "@pp/shared"

import type { GroupDocument } from "../groups/GroupDocs"
import type { TicketDocument } from "../tickets/TicketDocs"

type EventTicket = Pick<
  TicketDocument,
  "id" | "title" | "status" | "archivedAt"
>

const ticketEvent = (
  kind: "ticket_created" | "ticket_completed" | "ticket_reopened" | null,
  ticket: EventTicket
): ReadonlyArray<ProjectEvent> =>
  kind && ticket.archivedAt === null
    ? [{ kind, id: ticket.id, title: ticket.title, status: ticket.status }]
    : []

export const ticketCreatedEvents = (
  ticket: TicketDocument
): ReadonlyArray<ProjectEvent> => ticketEvent("ticket_created", ticket)

export const ticketEvents = (
  before: EventTicket,
  after: EventTicket,
  finished: ReadonlySet<string>
): ReadonlyArray<ProjectEvent> => {
  const wasFinished = finished.has(before.status)
  const isFinished = finished.has(after.status)
  return ticketEvent(
    wasFinished === isFinished
      ? null
      : isFinished
        ? "ticket_completed"
        : "ticket_reopened",
    after
  )
}

type SprintEventKind = (typeof SprintEvent.Type)["kind"]

export const sprintEvents = (
  before: GroupDocument | null,
  after: GroupDocument | null
): ReadonlyArray<ProjectEvent> => {
  const previous = before?.kind === "sprint" ? before : null
  const sprint = after?.kind === "sprint" ? after : null
  const event = (
    kind: SprintEventKind,
    group: GroupDocument
  ): ProjectEvent => ({
    kind,
    id: group.id,
    title: group.name,
    startsAt: group.startsAt
  })
  if (sprint === null)
    return previous === null ? [] : [event("sprint_deleted", previous)]
  const lifecycle: SprintEventKind | null =
    previous === null
      ? "sprint_created"
      : previous.name === sprint.name
        ? null
        : "sprint_renamed"
  const completed = sprint.completedAt !== null && before?.completedAt === null
  const reopened =
    sprint.completedAt === null &&
    previous !== null &&
    previous.completedAt !== null
  const started =
    sprint.completedAt === null &&
    sprint.startsAt !== null &&
    (before === null ||
      before.startsAt?.getTime() !== sprint.startsAt.getTime())
  const kinds: ReadonlyArray<SprintEventKind | null> = [
    lifecycle,
    completed ? "sprint_completed" : null,
    reopened ? "sprint_reopened" : null,
    started ? "sprint_started" : null
  ]
  return kinds.flatMap((kind) => (kind === null ? [] : [event(kind, sprint)]))
}
