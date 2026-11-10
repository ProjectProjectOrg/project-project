import type { GroupId, TicketFilter } from "@pp/shared"

export type SprintFilterValue = "all" | "ungrouped" | GroupId
export type FilterDimension =
  | "type"
  | "assignee"
  | "tags"
  | "sprint"
  | "estimate"
  | "archived"
  | "blocked"
  | "subTicketExpansion"

const FILTER_KEYS: Readonly<
  Record<FilterDimension, keyof TicketFilter | null>
> = {
  type: "type",
  assignee: "assignee",
  tags: "tags",
  sprint: "groupId",
  estimate: "estimate",
  archived: "archived",
  blocked: "blocked",
  subTicketExpansion: null
}

export function activeFilterCount(
  filter: TicketFilter | undefined,
  dimensions: ReadonlyArray<FilterDimension>
) {
  return dimensions.filter((dimension) => {
    const key = FILTER_KEYS[dimension]
    const value = key === null ? undefined : filter?.[key]
    return Array.isArray(value) ? value.length > 0 : value === true
  }).length
}

export function clearedFilters(
  dimensions: ReadonlyArray<FilterDimension>
): Partial<TicketFilter> {
  return Object.fromEntries(
    dimensions.flatMap((dimension) => {
      const key = FILTER_KEYS[dimension]
      return key === null ? [] : [[key, undefined]]
    })
  )
}
