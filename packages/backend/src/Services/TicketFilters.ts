import type { Ticket, TicketFilter } from "@projectproject/shared"

export const matchesTicketFilter = (
  ticket: Ticket,
  filter: TicketFilter | undefined
): boolean => {
  if (!filter) return true

  if (filter.status !== undefined) {
    if (filter.status.length === 0) return false
    if (!filter.status.includes(ticket.status)) return false
  }

  if (filter.type !== undefined) {
    if (filter.type.length === 0) return false
    if (!filter.type.includes(ticket.type)) return false
  }

  if (filter.assignee !== undefined) {
    if (filter.assignee.length === 0) return false
    const wantsUnassigned = filter.assignee.includes(null)
    const wantedIds = filter.assignee.filter(
      (a): a is string => a !== null
    )
    const isUnassigned = ticket.assignees.length === 0
    const hasWantedId = ticket.assignees.some((a) => wantedIds.includes(a))
    if (!(wantsUnassigned && isUnassigned) && !hasWantedId) return false
  }

  if (filter.tags !== undefined) {
    if (filter.tags.length === 0) return false
    if (!filter.tags.some((t) => ticket.tags.includes(t))) return false
  }

  if (filter.hasBranch !== undefined) {
    if (filter.hasBranch && ticket.branch === null) return false
    if (!filter.hasBranch && ticket.branch !== null) return false
  }

  if (filter.hasPr !== undefined) {
    if (filter.hasPr && ticket.pr === null) return false
    if (!filter.hasPr && ticket.pr !== null) return false
  }

  if (filter.updatedAfter !== undefined) {
    if (ticket.updatedAt.getTime() <= filter.updatedAfter.getTime()) return false
  }

  return true
}
