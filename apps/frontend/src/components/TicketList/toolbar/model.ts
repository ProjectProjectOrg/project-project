import type { GroupId, TicketFilter } from "@pp/shared"

export type SprintFilterValue = "all" | "ungrouped" | GroupId
export type FilterDimension =
  | "type"
  | "assignee"
  | "tags"
  | "sprint"
  | "archived"

export function activeFilterCount(
  filter: TicketFilter | undefined,
  dimensions: ReadonlyArray<FilterDimension>
) {
  return dimensions.filter((dimension) => {
    const value = filter?.[dimension === "sprint" ? "groupId" : dimension]
    return Array.isArray(value) ? value.length > 0 : value === true
  }).length
}
