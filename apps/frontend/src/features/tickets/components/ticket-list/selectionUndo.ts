import type { BulkTicketPatch, TicketId } from "@pp/shared"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

/*
 * Undo for the selection bar: a bulk change sets one value on every ticket,
 * so putting it back means one update per old value.
 */

export type Restore = Readonly<{
  ids: ReadonlyArray<TicketId>
  patch: BulkTicketPatch
}>

// Tickets grouped by a value, in first-seen order.
export function groupBy<V>(
  tickets: ReadonlyArray<SelectedTicket>,
  valueOf: (ticket: SelectedTicket) => V
) {
  const groups = new Map<string, { value: V; ids: Array<TicketId> }>()
  for (const ticket of tickets) {
    const value = valueOf(ticket)
    const key = JSON.stringify(value)
    const group = groups.get(key) ?? { value, ids: [] }
    group.ids.push(ticket.id)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => [group.value, group.ids] as const)
}

// The updates that put back what a change touched, per old value.
export function restoreOf(
  tickets: ReadonlyArray<SelectedTicket>,
  change: TicketEdit
) {
  const back = <V>(
    valueOf: (ticket: SelectedTicket) => V,
    patchOf: (value: V) => BulkTicketPatch
  ) =>
    groupBy(tickets, valueOf).map(([value, ids]) => ({
      ids,
      patch: patchOf(value)
    }))
  if (change.status !== undefined)
    return back(
      (ticket) => ticket.status,
      (status) => ({ status })
    )
  if (change.priority !== undefined)
    return back(
      (ticket) => ticket.priority,
      (priority) => ({ priority })
    )
  if (change.assignees !== undefined)
    return back(
      (ticket) => ticket.assignees.toSorted(),
      (assignees) => ({ assignees })
    )
  if (change.tags !== undefined)
    return back(
      (ticket) => ticket.tags.toSorted(),
      (tags) => ({ tags })
    )
  return []
}
