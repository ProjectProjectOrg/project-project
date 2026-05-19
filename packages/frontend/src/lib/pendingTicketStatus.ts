import type { Ticket, TicketId, TicketStatus } from "@projectproject/shared"

export function reconcilePendingTicketStatuses(
  current: ReadonlyMap<TicketId, TicketStatus>,
  tickets: ReadonlyArray<Pick<Ticket, "id" | "status">>
): ReadonlyMap<TicketId, TicketStatus> {
  let next: Map<TicketId, TicketStatus> | null = null
  for (const ticket of tickets) {
    const pending = current.get(ticket.id)
    if (pending === undefined || pending !== ticket.status) continue
    if (next === null) next = new Map(current)
    next.delete(ticket.id)
  }
  return next ?? current
}
