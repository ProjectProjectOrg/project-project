import type {
  AssigneeFilter,
  EstimateFilterValue,
  GroupIdFilter,
  TagName,
  TicketFilter,
  TicketType
} from "@pp/shared"

export type FilterChoice =
  | Readonly<{ dimension: "blocked" }>
  | Readonly<{ dimension: "archived" }>
  | Readonly<{ dimension: "type"; value: TicketType }>
  | Readonly<{ dimension: "assignee"; value: AssigneeFilter }>
  | Readonly<{ dimension: "sprint"; value: GroupIdFilter }>
  | Readonly<{ dimension: "estimate"; value: EstimateFilterValue }>
  | Readonly<{ dimension: "tags"; value: TagName }>

export type FilterChoiceDimension = FilterChoice["dimension"]

export type ValueFilterDimension = Extract<
  FilterChoice,
  Readonly<{ value: unknown }>
>["dimension"]

const toggled = <A>(
  values: ReadonlyArray<A> | undefined,
  value: A,
  multiple: boolean
): ReadonlyArray<A> | undefined => {
  const current = values ?? []
  if (!current.includes(value)) return multiple ? [...current, value] : [value]
  const next = current.filter((entry) => entry !== value)
  return next.length > 0 ? next : undefined
}

export const isChosen = (
  filter: TicketFilter,
  choice: FilterChoice
): boolean => {
  switch (choice.dimension) {
    case "blocked":
      return filter.blocked === true
    case "archived":
      return filter.archived === true
    case "type":
      return filter.type?.includes(choice.value) === true
    case "assignee":
      return filter.assignee?.includes(choice.value) === true
    case "sprint":
      return filter.groupId?.includes(choice.value) === true
    case "estimate":
      return filter.estimate?.includes(choice.value) === true
    case "tags":
      return filter.tags?.includes(choice.value) === true
  }
}

export const toggleChoice = (
  filter: TicketFilter,
  choice: FilterChoice
): Partial<TicketFilter> => {
  switch (choice.dimension) {
    case "blocked":
      return { blocked: filter.blocked === true ? undefined : true }
    case "archived":
      return { archived: filter.archived === true ? undefined : true }
    case "type":
      return { type: toggled(filter.type, choice.value, false) }
    case "assignee":
      return { assignee: toggled(filter.assignee, choice.value, false) }
    case "sprint":
      return { groupId: toggled(filter.groupId, choice.value, false) }
    case "estimate":
      return { estimate: toggled(filter.estimate, choice.value, false) }
    case "tags":
      return { tags: toggled(filter.tags, choice.value, true) }
  }
}

export const isValueDimension = (
  dimension: FilterChoiceDimension
): dimension is ValueFilterDimension =>
  dimension !== "blocked" && dimension !== "archived"
