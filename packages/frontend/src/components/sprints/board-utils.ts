import type { Ticket, TicketId, TicketStatus } from "@projectproject/shared"

export const BOARD_STATUSES: ReadonlyArray<TicketStatus> = [
  "todo",
  "in_progress",
  "done"
]

export type DragData = {
  type: "card"
  id: TicketId
  status: TicketStatus
}

export type CardDropData = {
  type: "card"
  id: TicketId
  status: TicketStatus
  edge: "top" | "bottom"
}

export type ColumnDropData = {
  type: "column"
  status: TicketStatus
}

export type DropData = CardDropData | ColumnDropData

export function effectiveStatus(
  ticket: Ticket,
  overlay: ReadonlyMap<TicketId, TicketStatus>
): TicketStatus {
  return overlay.get(ticket.id) ?? ticket.status
}

export function groupTicketsByStatus(
  ticketIds: ReadonlyArray<TicketId>,
  ticketById: ReadonlyMap<TicketId, Ticket>,
  overlay: ReadonlyMap<TicketId, TicketStatus>
): Record<TicketStatus, ReadonlyArray<Ticket>> {
  const out: Record<TicketStatus, Array<Ticket>> = {
    todo: [],
    in_progress: [],
    done: []
  }
  for (const tid of ticketIds) {
    const ticket = ticketById.get(tid)
    if (!ticket) continue
    out[effectiveStatus(ticket, overlay)].push(ticket)
  }
  return out
}
