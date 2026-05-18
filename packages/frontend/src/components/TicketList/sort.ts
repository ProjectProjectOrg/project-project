import { m } from "@/paraglide/messages"
import type { SortKey } from "@projectproject/shared"

export const SORT_LABELS: Record<SortKey, () => string> = {
  id: () => m.tickets_sort_id(),
  updated: () => m.tickets_sort_updated(),
  created: () => m.tickets_sort_created(),
  title: () => m.tickets_sort_title(),
  priority: () => m.tickets_sort_priority()
}
