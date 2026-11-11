import type { TicketFilter } from "@pp/shared"

export type FilterDimension =
  | "type"
  | "assignee"
  | "tags"
  | "sprint"
  | "estimate"
  | "archived"
  | "blocked"

const FILTER_KEYS: Readonly<Record<FilterDimension, keyof TicketFilter>> = {
  type: "type",
  assignee: "assignee",
  tags: "tags",
  sprint: "groupId",
  estimate: "estimate",
  archived: "archived",
  blocked: "blocked"
}

export function activeFilterCount(
  filter: TicketFilter | undefined,
  dimensions: ReadonlyArray<FilterDimension>
) {
  return dimensions.filter((dimension) => {
    const value = filter?.[FILTER_KEYS[dimension]]
    return Array.isArray(value) ? value.length > 0 : value === true
  }).length
}

export function clearedFilters(
  dimensions: ReadonlyArray<FilterDimension>
): Partial<TicketFilter> {
  return Object.fromEntries(
    dimensions.map((dimension) => [FILTER_KEYS[dimension], undefined])
  )
}
