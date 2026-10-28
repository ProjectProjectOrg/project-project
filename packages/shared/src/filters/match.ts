import { matchesEstimateFilter } from "../estimates"
import type { Estimate, EstimationMode } from "../schemas/Estimate"
import type {
  PullRequestState,
  TicketStatus,
  TicketType
} from "../schemas/Ticket"
import type { UserId } from "../schemas/User"
import type { TicketFilter, TicketListQuery } from "./Ticket"

export type MatchableTicket = Readonly<{
  id: string
  title: string
  status: TicketStatus
  type: TicketType
  tags: ReadonlyArray<string>
  branch: string | null
  pr: number | null
  prState?: PullRequestState | null
  assignees: ReadonlyArray<string>
  estimate: Estimate | null
  parent?: string | null
  archivedAt: Date | null
  updatedAt: Date
}>

export const matchesTicketFilter = (
  ticket: MatchableTicket,
  filter: TicketFilter | undefined,
  viewerId?: UserId,
  estimation: EstimationMode = "off"
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
    const wantsUnassigned = filter.assignee.includes("unassigned")
    const isUnassigned = ticket.assignees.length === 0
    const hasWantedAssignee = ticket.assignees.some((ticketAssignee) =>
      filter.assignee?.some((wantedAssignee) =>
        wantedAssignee === "mine"
          ? ticketAssignee === viewerId
          : wantedAssignee === ticketAssignee
      )
    )
    if (!(wantsUnassigned && isUnassigned) && !hasWantedAssignee) return false
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

  if (filter.estimate !== undefined) {
    if (filter.estimate.length === 0) return false
    if (!matchesEstimateFilter(ticket.estimate, filter.estimate, estimation))
      return false
  }

  if (filter.parent !== undefined) {
    const parent = ticket.parent ?? null
    if (
      !filter.parent.some((wanted) =>
        wanted === "none" ? parent === null : wanted === parent
      )
    )
      return false
  }

  if (filter.updatedAfter !== undefined) {
    if (ticket.updatedAt.getTime() <= filter.updatedAfter.getTime())
      return false
  }

  return true
}

export const matchesTicketQuery = (
  ticket: MatchableTicket,
  query: TicketFilter & Pick<TicketListQuery, "q">,
  viewerId: UserId | undefined,
  estimation: EstimationMode
): boolean => {
  const showArchived = query.archived === true
  if ((ticket.archivedAt !== null) !== showArchived) return false

  if (!matchesTicketFilter(ticket, query, viewerId, estimation)) return false

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
