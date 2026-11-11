import { SortKey, type EstimationMode } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const SORT_FIELD_LABELS: Readonly<Record<SortKey, () => string>> = {
  id: () => m.tickets_sort_id(),
  updated: () => m.tickets_view_options_updated(),
  created: () => m.tickets_view_options_created(),
  title: () => m.tickets_sort_title(),
  priority: () => m.tickets_view_options_priority(),
  estimate: () => m.tickets_view_options_estimate()
}

export const sortKeysFor = (
  estimation: EstimationMode
): ReadonlyArray<SortKey> =>
  SortKey.literals.filter((key) => key !== "estimate" || estimation !== "off")
