import {
  TicketId,
  TicketStatus,
  type ProjectStatus,
  type Ticket
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { compareByOrderKey } from "@/lib/orderKey"

export const DragData = Schema.Struct({
  type: Schema.Literal("card"),
  id: TicketId,
  status: TicketStatus
})
export type DragData = typeof DragData.Type

export const CardDropData = Schema.Struct({
  type: Schema.Literal("card"),
  id: TicketId,
  status: TicketStatus,
  edge: Schema.Literals(["top", "bottom"])
})
export type CardDropData = typeof CardDropData.Type

export const ColumnDropData = Schema.Struct({
  type: Schema.Literal("column"),
  status: TicketStatus
})
export type ColumnDropData = typeof ColumnDropData.Type

export const DropData = Schema.Union([CardDropData, ColumnDropData])
export type DropData = typeof DropData.Type

export const isDragData = Schema.is(DragData)
export const isDropData = Schema.is(DropData)
export const isColumnDropData = Schema.is(ColumnDropData)

export function boardStatusesFor(
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<TicketStatus> {
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
