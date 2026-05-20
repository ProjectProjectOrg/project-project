import type { ProjectStatus, Ticket, TicketId } from "@projectproject/shared"

export type DragData = {
  type: "card"
  id: TicketId
  status: string
}

export type CardDropData = {
  type: "card"
  id: TicketId
  status: string
  edge: "top" | "bottom"
}

export type ColumnDropData = {
  type: "column"
  status: string
}

export type DropData = CardDropData | ColumnDropData

export function effectiveStatus(
  ticket: Ticket,
  overlay: ReadonlyMap<TicketId, string>
): string {
  return overlay.get(ticket.id) ?? ticket.status
}

export function boardStatusesFor(
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<string> {
  return [...statuses]
    .toSorted((a, b) =>
      a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
    )
    .map((s) => s.slug)
}

export function groupTicketsByStatus(
  ticketIds: ReadonlyArray<TicketId>,
  ticketById: ReadonlyMap<TicketId, Ticket>,
  overlay: ReadonlyMap<TicketId, string>,
  statusSlugs: ReadonlyArray<string>
): Record<string, ReadonlyArray<Ticket>> {
  const out: Record<string, Array<Ticket>> = {}
  for (const slug of statusSlugs) out[slug] = []
  for (const tid of ticketIds) {
    const ticket = ticketById.get(tid)
    if (!ticket) continue
    const status = effectiveStatus(ticket, overlay)
    if (!out[status]) out[status] = []
    out[status].push(ticket)
  }
  return out
}
