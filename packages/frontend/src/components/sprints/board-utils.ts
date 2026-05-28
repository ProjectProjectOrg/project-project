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

export const compareByOrderKey = <T extends { orderKey: string }>(
  a: T,
  b: T
): number => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)

export function boardStatusesFor(
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<string> {
  return [...statuses].toSorted(compareByOrderKey).map((s) => s.slug)
}

export function groupTicketsByStatus(
  ticketIds: ReadonlyArray<TicketId>,
  ticketById: ReadonlyMap<TicketId, Ticket>,
  overlay: ReadonlyMap<TicketId, string>,
  statusSlugs: ReadonlyArray<string>
): Record<string, ReadonlyArray<Ticket>> {
  const out: Record<string, Array<Ticket>> = {}
  for (const slug of statusSlugs) out[slug] = []
  const fallback = statusSlugs[0]
  const known = new Set(statusSlugs)
  for (const tid of ticketIds) {
    const ticket = ticketById.get(tid)
    if (!ticket) continue
    const status = effectiveStatus(ticket, overlay)
    const bucket = known.has(status) ? status : fallback
    if (bucket === undefined) continue
    out[bucket].push(ticket)
  }
  return out
}
