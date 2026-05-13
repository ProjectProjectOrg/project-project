import { PRIORITY_META } from "@/lib/priority-meta"
import { m } from "@/paraglide/messages"
import { padNumericIdSort, type Ticket } from "@projectproject/shared"

function compareId(a: Ticket, b: Ticket): number {
  const aSort = padNumericIdSort(a.id)
  const bSort = padNumericIdSort(b.id)
  if (aSort && bSort) return aSort.localeCompare(bSort)
  return a.id.localeCompare(b.id)
}

export const SORTS = {
  id: {
    label: () => m.tickets_sort_id(),
    compare: compareId
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
