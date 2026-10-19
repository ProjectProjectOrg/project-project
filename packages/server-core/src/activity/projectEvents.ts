import type { ProjectEvent } from "@pp/shared"

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

export const sprintEvents = (
  before: GroupDocument | null,
  after: GroupDocument | null
): ReadonlyArray<ProjectEvent> => {
  if (!after || after.kind !== "sprint") return []
  const kind =
    after.completedAt !== null && before?.completedAt === null
      ? "sprint_completed"
      : after.completedAt === null &&
          (before === null ||
            before.startsAt?.getTime() !== after.startsAt?.getTime())
        ? "sprint_started"
        : null
  return kind
    ? [{ kind, id: after.id, title: after.name, startsAt: after.startsAt }]
    : []
}
