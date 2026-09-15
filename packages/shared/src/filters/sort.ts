import { padNumericIdSort } from "../cursor"
import type { TicketPriority } from "../schemas/Ticket"
import type { SortKey, TicketSort } from "./Ticket"

export type SortableTicket = Readonly<{
  id: string
  title: string
  priority: TicketPriority
  createdAt: Date
  updatedAt: Date
}>

export const TICKET_PRIORITY_RANK: Record<TicketPriority, number> = {
  low: 1,
  med: 2,
  high: 3
}

const compareStrings = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

const primaryComparators: Record<
  SortKey,
  (a: SortableTicket, b: SortableTicket) => number
> = {
  id: (a, b) =>
    compareStrings(
      padNumericIdSort(a.id) ?? a.id,
      padNumericIdSort(b.id) ?? b.id
    ),
  created: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  updated: (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
  title: (a, b) => compareStrings(a.title.toLowerCase(), b.title.toLowerCase()),
  priority: (a, b) =>
    TICKET_PRIORITY_RANK[a.priority] - TICKET_PRIORITY_RANK[b.priority]
}

export const ticketComparator =
  (sort: TicketSort) =>
  (a: SortableTicket, b: SortableTicket): number => {
    const primary = primaryComparators[sort.key](a, b)
    if (primary !== 0) return sort.dir === "asc" ? primary : -primary
    return compareStrings(a.id, b.id)
  }
