import {
  activeEstimate,
  estimateRank,
  type EstimationMode,
  type StatusPhaseOf,
  type Ticket
} from "@pp/shared"

import { formatEstimateAmount } from "@/features/tickets/lib/estimateMeta"
import { m } from "@/paraglide/messages"

export type PlanMeasure =
  | Readonly<{ kind: "estimate"; unit: "points" | "time" }>
  | Readonly<{ kind: "count" }>

export const planMeasure = (mode: EstimationMode) =>
  mode === "points" || mode === "time"
    ? ({ kind: "estimate", unit: mode } satisfies PlanMeasure)
    : ({ kind: "count" } satisfies PlanMeasure)

export const formatAmount = (measure: PlanMeasure, amount: number) =>
  measure.kind === "estimate"
    ? formatEstimateAmount(measure.unit, amount)
    : m.sprints_overview_ticket_count({ count: amount })

type Weighed = Pick<Ticket, "estimate">

const weightOf = (ticket: Weighed, measure: PlanMeasure) => {
  if (measure.kind === "count") return 1
  const estimate = activeEstimate(ticket.estimate, measure.unit)
  return estimate === null ? null : estimateRank(estimate)
}

type PlanTotals = Readonly<{ committed: number; unestimated: number }>

export const planTotals = (
  tickets: ReadonlyArray<Weighed>,
  measure: PlanMeasure
) => {
  let committed = 0
  let unestimated = 0
  for (const ticket of tickets) {
    const weight = weightOf(ticket, measure)
    if (weight === null) unestimated += 1
    else committed += weight
  }
  return { committed, unestimated } satisfies PlanTotals
}

export const averageDone = (
  sprints: ReadonlyArray<ReadonlyArray<Weighed & Readonly<{ status: string }>>>,
  measure: PlanMeasure,
  phaseOf: StatusPhaseOf
) => {
  if (sprints.length === 0) return null
  const done = sprints.map((tickets) =>
    tickets
      .filter((ticket) => phaseOf(ticket.status) === "finished")
      .reduce((sum, ticket) => sum + (weightOf(ticket, measure) ?? 0), 0)
  )
  const average = Math.round(
    done.reduce((sum, value) => sum + value, 0) / done.length
  )
  return average > 0 ? average : null
}

export type AssigneeLoad = Readonly<{
  assignee: string | null
  amount: number
  tickets: number
}>

export const loadByAssignee = (
  tickets: ReadonlyArray<Weighed & Pick<Ticket, "assignees">>,
  measure: PlanMeasure
) => {
  const loads = new Map<string | null, { amount: number; tickets: number }>()
  for (const ticket of tickets) {
    const weight = weightOf(ticket, measure) ?? 0
    const owners = ticket.assignees.length === 0 ? [null] : ticket.assignees
    for (const owner of owners) {
      const load = loads.get(owner) ?? { amount: 0, tickets: 0 }
      loads.set(owner, {
        amount: load.amount + weight,
        tickets: load.tickets + 1
      })
    }
  }
  return [...loads]
    .map(([assignee, load]) => ({ assignee, ...load }) satisfies AssigneeLoad)
    .toSorted(
      (a, b) =>
        Number(a.assignee === null) - Number(b.assignee === null) ||
        b.amount - a.amount ||
        b.tickets - a.tickets
    )
}

export const ownedBy = <T extends Pick<Ticket, "assignees">>(
  tickets: ReadonlyArray<T>,
  assignee: string | null
) =>
  tickets.filter((ticket) =>
    assignee === null
      ? ticket.assignees.length === 0
      : ticket.assignees.includes(assignee)
  )

const MIN_HISTORY_SPRINTS = 2

export const usualDone = (
  sprints: ReadonlyArray<
    ReadonlyArray<
      Weighed & Pick<Ticket, "assignees"> & Readonly<{ status: string }>
    >
  >,
  measure: PlanMeasure,
  phaseOf: StatusPhaseOf,
  assignee: string
) =>
  sprints.length < MIN_HISTORY_SPRINTS
    ? null
    : averageDone(
        sprints.map((tickets) => ownedBy(tickets, assignee)),
        measure,
        phaseOf
      )
