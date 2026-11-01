import type { ProjectEvent, SprintEvent } from "@pp/shared"

import type { GroupDocument } from "../groups/GroupDocs"
import type { TicketDocument } from "../tickets/TicketDocs"

type EventTicket = Pick<
  TicketDocument,
  "id" | "title" | "status" | "type" | "assignees" | "archivedAt"
>

const ticketFields = (ticket: EventTicket) => ({
  id: ticket.id,
  title: ticket.title,
  status: ticket.status,
  type: ticket.type
})

export const ticketCreatedEvents = (
  ticket: EventTicket
): ReadonlyArray<ProjectEvent> =>
  ticket.archivedAt === null
    ? [{ kind: "ticket_created", ...ticketFields(ticket) }]
    : []

const without = (
  values: ReadonlyArray<string>,
  excluded: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const skip = new Set(excluded)
  return [...new Set(values)].filter((value) => !skip.has(value))
}

export const assigneesChanged = (
  before: Pick<EventTicket, "assignees">,
  after: Pick<EventTicket, "assignees">
) =>
  without(after.assignees, before.assignees).length > 0 ||
  without(before.assignees, after.assignees).length > 0

export const ticketEvents = (
  before: EventTicket,
  after: EventTicket,
  finished: ReadonlySet<string>
): ReadonlyArray<ProjectEvent> => {
  if (after.archivedAt !== null) return []
  const fields = ticketFields(after)
  const events: Array<ProjectEvent> = []
  if (before.status !== after.status) {
    events.push({
      kind: "ticket_status_changed",
      ...fields,
      previousStatus: before.status
    })
    const wasFinished = finished.has(before.status)
    const isFinished = finished.has(after.status)
    if (wasFinished !== isFinished)
      events.push({
        kind: isFinished ? "ticket_completed" : "ticket_reopened",
        ...fields
      })
  }
  if (assigneesChanged(before, after))
    events.push({
      kind: "ticket_assignees_changed",
      ...fields,
      assignees: [...new Set(after.assignees)],
      added: without(after.assignees, before.assignees),
      removed: without(before.assignees, after.assignees)
    })
  return events
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
