import type { ProjectEvent, SprintEvent } from "@pp/shared"

import type { GroupDocument } from "../groups/GroupDocs"
import type { TicketDocument } from "../tickets/TicketDocs"

export const ticketEvents = (
  before: TicketDocument | null,
  after: TicketDocument
): ReadonlyArray<ProjectEvent> => {
  const kind =
    before === null
      ? "ticket_created"
      : before.status === after.status
        ? null
        : after.status === "done"
          ? "ticket_completed"
          : before.status === "done"
            ? "ticket_reopened"
            : null
  return kind && after.archivedAt === null
    ? [{ kind, id: after.id, title: after.title, status: after.status }]
    : []
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
