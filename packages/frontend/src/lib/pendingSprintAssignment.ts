import type { GroupId, TicketId } from "@projectproject/shared"

export type PendingSprintAssignment = ReadonlyMap<TicketId, GroupId | null>

export function reconcilePendingSprintAssignments(
  current: PendingSprintAssignment,
  sprints: ReadonlyArray<{
    id: GroupId
    completedAt: Date | null
    tickets: ReadonlyArray<TicketId>
  }>
): PendingSprintAssignment {
  if (current.size === 0) return current
  const serverMembership = new Map<TicketId, GroupId>()
  for (const sprint of sprints) {
    if (sprint.completedAt !== null) continue
    for (const tid of sprint.tickets) {
      if (!serverMembership.has(tid)) serverMembership.set(tid, sprint.id)
    }
  }
  let next: Map<TicketId, GroupId | null> | null = null
  for (const [tid, target] of current) {
    const actual = serverMembership.get(tid) ?? null
    if (target === actual) {
      if (next === null) next = new Map(current)
      next.delete(tid)
    }
  }
  return next ?? current
}
