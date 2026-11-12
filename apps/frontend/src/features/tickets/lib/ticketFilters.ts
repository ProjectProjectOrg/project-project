import {
  sprintState,
  type TicketListQuery,
  type TicketFilterRule,
  type Group,
  type TicketId,
  type SprintSectionKey,
  type GroupIdFilter
} from "@pp/shared"

export const toggled = <A>(
  selected: ReadonlyArray<A> | undefined,
  value: A
): ReadonlyArray<A> | undefined => {
  const current = selected ?? []
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value]
  return next.length ? next : undefined
}

export const filterableSprints = (
  sprints: ReadonlyArray<Group>,
  now: Date,
  selected: ReadonlyArray<GroupIdFilter> = []
): ReadonlyArray<Group> =>
  sprints.filter((sprint) => {
    const state = sprintState(sprint, now)
    return (
      state === "active" || state === "planned" || selected.includes(sprint.id)
    )
  })

export function hasTicketFilters(query: TicketListQuery): boolean {
  return (
    !!query.q ||
    (query.rules?.length ?? 0) > 0 ||
    query.hasBranch !== undefined ||
    query.hasPr !== undefined ||
    query.updatedAfter !== undefined
  )
}

export function restoreStatusRule(
  query: TicketListQuery,
  previous: TicketListQuery
): TicketListQuery["rules"] {
  const current = query.rules ?? []
  const earlier = previous.rules ?? []
  return [
    ...earlier.flatMap((rule) =>
      rule.field === "status"
        ? [rule]
        : current.filter((next) => next.field === rule.field)
    ),
    ...current.filter(
      (rule) => !earlier.some((old) => old.field === rule.field)
    )
  ]
}

export function withCreatedSprintTicket(
  sprints: ReadonlyArray<Group>,
  ticketId: TicketId,
  section: SprintSectionKey
): ReadonlyArray<Group> {
  return sprints.map((sprint) =>
    sprint.id === section
      ? { ...sprint, tickets: [...sprint.tickets, ticketId] }
      : sprint
  )
}

const canonicalRule = (rule: TicketFilterRule): TicketFilterRule => {
  switch (rule.field) {
    case "status":
      return { ...rule, values: rule.values.toSorted() }
    case "type":
      return { ...rule, values: rule.values.toSorted() }
    case "assignee":
      return { ...rule, values: rule.values.toSorted() }
    case "sprint":
      return { ...rule, values: rule.values.toSorted() }
    case "tags":
      return { ...rule, values: rule.values.toSorted() }
    case "estimate":
      return { ...rule, values: rule.values.toSorted() }
    case "archived":
    case "blocked":
      return rule
  }
  const exhaustive: never = rule
  return exhaustive
}

export function canonicalTicketQuery(query: TicketListQuery): TicketListQuery {
  return {
    ...query,
    rules: query.rules?.length
      ? query.rules
          .map(canonicalRule)
          .toSorted((a, b) => a.field.localeCompare(b.field))
      : undefined
  }
}
