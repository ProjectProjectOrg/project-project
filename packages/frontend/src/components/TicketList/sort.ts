import { PRIORITY_META } from "@/lib/priority-meta"
import { m } from "@/paraglide/messages"
import type { Ticket } from "@projectproject/shared"

function idNum(t: Ticket): number {
  return Number(t.id.slice(2))
}

export const SORTS = {
  id: {
    label: () => m.tickets_sort_id(),
    compare: (a: Ticket, b: Ticket) => idNum(a) - idNum(b)
  },
  updated: {
    label: () => m.tickets_sort_updated(),
    compare: (a: Ticket, b: Ticket) =>
      b.updatedAt.getTime() - a.updatedAt.getTime()
  },
  created: {
    label: () => m.tickets_sort_created(),
    compare: (a: Ticket, b: Ticket) =>
      b.createdAt.getTime() - a.createdAt.getTime()
  },
  title: {
    label: () => m.tickets_sort_title(),
    compare: (a: Ticket, b: Ticket) => a.title.localeCompare(b.title)
  },
  priority: {
    label: () => m.tickets_sort_priority(),
    compare: (a: Ticket, b: Ticket) =>
      PRIORITY_META[b.priority].ordinal - PRIORITY_META[a.priority].ordinal
  }
} as const

export type SortKey = keyof typeof SORTS
