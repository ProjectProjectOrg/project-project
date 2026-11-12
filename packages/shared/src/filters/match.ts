import type { UserId } from "../auth/User"
import type { Estimate, EstimationMode } from "../estimates/Estimate"
import { matchesEstimateFilter } from "../estimates/estimates"
import type { Group } from "../groups/Group"
import type {
  PullRequestState,
  TicketStatus,
  TicketType
} from "../tickets/Ticket"
import { ticketRule } from "./rules"
import type { TicketFilter, TicketFilterRule, TicketListQuery } from "./Ticket"

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
  parent?: Readonly<{ id: string }> | null
  openBlockerCount?: number
  archivedAt: Date | null
  updatedAt: Date
}>

export function matchesTicketRule(
  ticket: MatchableTicket,
  rule: TicketFilterRule,
  viewerId: UserId | undefined,
  estimation: EstimationMode,
  sprints: ReadonlyArray<Group> | undefined
): boolean {
  const positive = (): boolean => {
    switch (rule.field) {
      case "status":
        return rule.values.includes(ticket.status)
      case "type":
        return rule.values.includes(ticket.type)
      case "tags":
        return rule.values.some((tag) => ticket.tags.includes(tag))
      case "assignee":
        return rule.values.some((value) =>
          value === "unassigned"
            ? ticket.assignees.length === 0
            : ticket.assignees.some(
                (id) => id === (value === "mine" ? viewerId : value)
              )
        )
      case "estimate":
        return matchesEstimateFilter(ticket.estimate, rule.values, estimation)
      case "archived":
        return ticket.archivedAt !== null
      case "blocked":
        return (ticket.openBlockerCount ?? 0) > 0
      case "sprint":
        return rule.values.some((value) =>
          value === "ungrouped"
            ? !sprints?.some(
                (sprint) =>
                  sprint.completedAt === null &&
                  sprint.tickets.some((id) => id === ticket.id)
              )
            : sprints?.some(
                (sprint) =>
                  sprint.id === value &&
                  sprint.tickets.some((id) => id === ticket.id)
              ) === true
        )
    }
  }
  if (rule.field === "sprint" && sprints === undefined) return false
  return positive() === (rule.operator === "is")
}

export const matchesTicketFilter = (
  ticket: MatchableTicket,
  filter: TicketFilter | undefined,
  viewerId?: UserId,
  estimation: EstimationMode = "off",
  sprints?: ReadonlyArray<Group>
): boolean => {
  if (!filter) return true
  if (
    filter.rules?.some(
      (rule) => !matchesTicketRule(ticket, rule, viewerId, estimation, sprints)
    )
  )
    return false
  if (
    filter.hasBranch !== undefined &&
    (ticket.branch !== null) !== filter.hasBranch
  )
    return false
  if (filter.hasPr !== undefined && (ticket.pr !== null) !== filter.hasPr)
    return false
  if (
    filter.parent !== undefined &&
    !filter.parent.some((wanted) =>
      wanted === "none" ? ticket.parent == null : wanted === ticket.parent?.id
    )
  )
    return false
  if (
    filter.updatedAfter !== undefined &&
    ticket.updatedAt.getTime() <= filter.updatedAfter.getTime()
  )
    return false
  return true
}

export const matchesTicketQuery = (
  ticket: MatchableTicket,
  query: TicketFilter & Pick<TicketListQuery, "q">,
  viewerId: UserId | undefined,
  estimation: EstimationMode,
  sprints?: ReadonlyArray<Group>
): boolean => {
  if (
    query.scopeGroupId !== undefined &&
    !sprints?.some(
      (sprint) =>
        sprint.id === query.scopeGroupId &&
        sprint.tickets.some((id) => id === ticket.id)
    )
  )
    return false
  if (ticketRule(query, "archived") === undefined && ticket.archivedAt !== null)
    return false
  if (!matchesTicketFilter(ticket, query, viewerId, estimation, sprints))
    return false
  const needle = query.q?.trim().toLowerCase()
  return (
    !needle ||
    ticket.title.toLowerCase().includes(needle) ||
    ticket.id.toLowerCase().includes(needle)
  )
}
