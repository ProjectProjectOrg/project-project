import type { TicketStatus, TicketType } from "../schemas/Ticket"
import type { TicketFilter, TicketListQuery } from "./Ticket"

export interface MatchableTicket {
  readonly id: string
  readonly title: string
  readonly status: TicketStatus
  readonly type: TicketType
  readonly tags: ReadonlyArray<string>
  readonly branch: string | null
  readonly pr: number | null
  readonly assignees: ReadonlyArray<string>
  readonly updatedAt: Date
}

export const matchesTicketFilter = (
  ticket: MatchableTicket,
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
      (a): a is string => a !== null && a !== "mine"
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

export const matchesTicketQuery = (
  ticket: MatchableTicket,
  query: Pick<TicketListQuery, "filter" | "q">,
  viewerId: string
): boolean => {
  if (query.filter !== undefined) {
    const resolvedFilter: TicketFilter = query.filter.assignee
      ? {
          ...query.filter,
          assignee: query.filter.assignee.map((a) =>
            a === "mine" ? viewerId : a
          )
        }
      : query.filter
    if (!matchesTicketFilter(ticket, resolvedFilter)) return false
  }

  if (query.q !== undefined) {
    const needle = query.q.trim().toLowerCase()
    if (needle.length > 0) {
      if (
        !ticket.title.toLowerCase().includes(needle) &&
        !ticket.id.toLowerCase().includes(needle)
      ) {
        return false
      }
    }
  }

  return true
}
