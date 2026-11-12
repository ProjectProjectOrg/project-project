import type {
  AssigneeFilter,
  EstimateFilterValue,
  GroupIdFilter,
  TagName,
  TicketFilter,
  TicketFilterRule,
  TicketType
} from "@pp/shared"
import { ticketRule, withTicketRule, withoutTicketRule } from "@pp/shared"

import { toggled } from "./ticketFilters"

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

export const isChosen = (
  filter: TicketFilter,
  choice: FilterChoice
): boolean => {
  const rule = ticketRule(filter, choice.dimension)
  return (
    rule !== undefined &&
    (!("value" in choice) ||
      ("values" in rule && rule.values.some((value) => value === choice.value)))
  )
}

export const toggleChoice = (
  filter: TicketFilter,
  choice: FilterChoice
): Partial<TicketFilter> => {
  const operator = ticketRule(filter, choice.dimension)?.operator ?? "is"
  const changed = (rule: TicketFilterRule): Partial<TicketFilter> => ({
    rules: withTicketRule(filter, rule)
  })
  switch (choice.dimension) {
    case "blocked":
    case "archived":
      return {
        rules: ticketRule(filter, choice.dimension)
          ? withoutTicketRule(filter, choice.dimension)
          : withTicketRule(filter, { field: choice.dimension, operator: "is" })
      }
    case "type": {
      const values = toggled(ticketRule(filter, "type")?.values, choice.value)
      return values
        ? changed({ field: "type", operator, values })
        : { rules: withoutTicketRule(filter, "type") }
    }
    case "assignee": {
      const values = toggled(
        ticketRule(filter, "assignee")?.values,
        choice.value
      )
      return values
        ? changed({ field: "assignee", operator, values })
        : { rules: withoutTicketRule(filter, "assignee") }
    }
    case "sprint": {
      const values = toggled(ticketRule(filter, "sprint")?.values, choice.value)
      return values
        ? changed({ field: "sprint", operator, values })
        : { rules: withoutTicketRule(filter, "sprint") }
    }
    case "estimate": {
      const values = toggled(
        ticketRule(filter, "estimate")?.values,
        choice.value
      )
      return values
        ? changed({ field: "estimate", operator, values })
        : { rules: withoutTicketRule(filter, "estimate") }
    }
    case "tags": {
      const values = toggled(ticketRule(filter, "tags")?.values, choice.value)
      return values
        ? changed({ field: "tags", operator, values })
        : { rules: withoutTicketRule(filter, "tags") }
    }
  }
}

export const isValueDimension = (
  dimension: FilterChoiceDimension
): dimension is ValueFilterDimension =>
  dimension !== "blocked" && dimension !== "archived"
