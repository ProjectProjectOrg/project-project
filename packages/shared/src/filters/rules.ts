import type { TicketFilter, TicketFilterRule } from "./Ticket"

export function ticketRule<F extends TicketFilterRule["field"]>(
  filter: TicketFilter,
  field: F
): Extract<TicketFilterRule, Readonly<{ field: F }>> | undefined {
  return filter.rules?.find(
    (rule): rule is Extract<TicketFilterRule, Readonly<{ field: F }>> =>
      rule.field === field
  )
}

export function withTicketRule(
  filter: TicketFilter,
  rule: TicketFilterRule
): ReadonlyArray<TicketFilterRule> {
  const rules = filter.rules ?? []
  return rules.some((current) => current.field === rule.field)
    ? rules.map((current) => (current.field === rule.field ? rule : current))
    : [...rules, rule]
}

export function withoutTicketRule(
  filter: TicketFilter,
  field: TicketFilterRule["field"]
): ReadonlyArray<TicketFilterRule> {
  return filter.rules?.filter((rule) => rule.field !== field) ?? []
}

export function matchesStatusRule(
  filter: TicketFilter,
  status: string
): boolean {
  const rule = ticketRule(filter, "status")
  return (
    rule === undefined ||
    rule.values.some((value) => value === status) === (rule.operator === "is")
  )
}

export function nonEpicTicketRules(
  filter: TicketFilter
): ReadonlyArray<TicketFilterRule> {
  const rule = ticketRule(filter, "type")
  return withTicketRule(
    filter,
    rule?.operator === "is"
      ? { ...rule, values: rule.values.filter((type) => type !== "epic") }
      : {
          field: "type",
          operator: "isNot",
          values: [...new Set([...(rule?.values ?? []), "epic" as const])]
        }
  )
}
