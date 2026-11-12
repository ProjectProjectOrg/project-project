import type { TicketFilter } from "@pp/shared"

export type FilterDimension =
  | "type"
  | "assignee"
  | "tags"
  | "sprint"
  | "estimate"
  | "archived"
  | "blocked"

export function activeFilterCount(
  filter: TicketFilter | undefined,
  dimensions: ReadonlyArray<FilterDimension>
): number {
  return (
    filter?.rules?.filter((rule) =>
      dimensions.some((dimension) => dimension === rule.field)
    ).length ?? 0
  )
}

export function clearedFilters(
  filter: TicketFilter,
  dimensions: ReadonlyArray<FilterDimension>
): Partial<TicketFilter> {
  return {
    rules: filter.rules?.filter(
      (rule) => !dimensions.some((dimension) => dimension === rule.field)
    )
  }
}
