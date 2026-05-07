import { PRIORITY_META } from "@/lib/priority-meta"
import type { Ticket } from "@projectproject/shared"

function idNum(t: Ticket): number {
  return Number(t.id.slice(2))
}

export const SORTS = {
  id: { label: "ID", compare: (a: Ticket, b: Ticket) => idNum(a) - idNum(b) },
  updated: {
    label: "Recently updated",
    compare: (a: Ticket, b: Ticket) =>
      b.updatedAt.getTime() - a.updatedAt.getTime()
  },
  created: {
    label: "Recently created",
    compare: (a: Ticket, b: Ticket) =>
      b.createdAt.getTime() - a.createdAt.getTime()
  },
  title: {
    label: "Title",
    compare: (a: Ticket, b: Ticket) => a.title.localeCompare(b.title)
  },
  priority: {
    label: "Priority (high → low)",
    compare: (a: Ticket, b: Ticket) =>
      PRIORITY_META[b.priority].ordinal - PRIORITY_META[a.priority].ordinal
  }
} as const

export type SortKey = keyof typeof SORTS
