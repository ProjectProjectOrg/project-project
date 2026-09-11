import type { Ticket, TicketDetail, UpdateTicketInput } from "@projectproject/shared"

/** Apply a server patch to a list row. Fields absent from the patch are kept. */
export function applyTicketPatch(
  ticket: Ticket,
  patch: UpdateTicketInput
): Ticket {
  return {
    ...ticket,
    title: patch.title ?? ticket.title,
    status: patch.status ?? ticket.status,
    type: patch.type ?? ticket.type,
    priority: patch.priority ?? ticket.priority,
    tags: patch.tags ?? ticket.tags,
    assignees: patch.assignees ?? ticket.assignees
  }
}

/** Same, for the detail view, which also owns `body`. */
export function applyTicketDetailPatch(
  ticket: TicketDetail,
  patch: UpdateTicketInput
): TicketDetail {
  return {
    ...applyTicketPatch(ticket, patch),
    body: patch.body ?? ticket.body
  }
}
