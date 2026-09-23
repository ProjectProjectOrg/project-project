import type { SortKey } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const SORT_LABELS: Record<SortKey, () => string> = {
  id: () => m.tickets_sort_id(),
  updated: () => m.tickets_sort_updated(),
  created: () => m.tickets_sort_created(),
  title: () => m.tickets_sort_title(),
  priority: () => m.tickets_sort_priority()
}

export const SORT_FIELD_LABELS: Readonly<Record<SortKey, () => string>> = {
  id: () => m.tickets_sort_id(),
  updated: () => m.tickets_view_options_updated(),
  created: () => m.tickets_view_options_created(),
  title: () => m.tickets_sort_title(),
  priority: () => m.tickets_view_options_priority()
}
