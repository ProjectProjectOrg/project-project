import type { ProjectStatus, Ticket, TicketId } from "@projectproject/shared"
import { compareByOrderKey } from "@/lib/orderKey"

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

export function boardStatusesFor(
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<string> {
  return [...statuses].toSorted(compareByOrderKey).map((s) => s.slug)
}

export function groupTicketsByStatus(
  tickets: ReadonlyArray<Ticket>,
  statusSlugs: ReadonlyArray<string>
): Record<string, ReadonlyArray<Ticket>> {
  const out: Record<string, Array<Ticket>> = {}
  for (const slug of statusSlugs) out[slug] = []
  const fallback = statusSlugs[0]
  const known = new Set(statusSlugs)
  for (const ticket of tickets) {
    const bucket = known.has(ticket.status) ? ticket.status : fallback
    if (bucket === undefined) continue
    out[bucket].push(ticket)
  }
  return out
}
