import {
  sprintState,
  type Group,
  type StatusPhase,
  type StatusPhaseOf,
  type Ticket
} from "@pp/shared"

import { timeOr } from "./sprintDates"

export type SprintOverview = Readonly<{
  active: ReadonlyArray<Group>
  upcoming: ReadonlyArray<Group>
  completed: ReadonlyArray<Group>
}>

export const sprintOverview = (
  sprints: ReadonlyArray<Group>,
  now: Date
): SprintOverview => {
  const byState = (state: ReturnType<typeof sprintState>) =>
    sprints.filter((sprint) => sprintState(sprint, now) === state)
  return {
    active: byState("active").toSorted(
      (a, b) => timeOr(a.startsAt, 0) - timeOr(b.startsAt, 0)
    ),
    upcoming: byState("planned").toSorted(
      (a, b) =>
        timeOr(a.startsAt, Number.MAX_SAFE_INTEGER) -
          timeOr(b.startsAt, Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    ),
    completed: byState("completed").toSorted(
      (a, b) => timeOr(b.completedAt, 0) - timeOr(a.completedAt, 0)
    )
  }
}

export type PhaseCounts = Readonly<Record<StatusPhase | "total", number>>

export const countPhases = (
  tickets: ReadonlyArray<Pick<Ticket, "status">>,
  phaseOf: StatusPhaseOf
): PhaseCounts => {
  const counts = { unstarted: 0, started: 0, finished: 0 }
  for (const ticket of tickets) counts[phaseOf(ticket.status)] += 1
  return { ...counts, total: tickets.length }
}
