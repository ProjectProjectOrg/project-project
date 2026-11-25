import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group,
  type GroupId
} from "@pp/shared"

import { nowDate, timeOr } from "./sprintDates"

const STATE_ORDER = { completed: 0, active: 1, planned: 2 } as const

const LAST = Number.MAX_SAFE_INTEGER

export function sprintNeighbours(
  sprints: ReadonlyArray<Group>,
  id: GroupId,
  now?: Date
) {
  const ordered = sprints.toSorted((a, b) => {
    const stateA = sprintState(a, now)
    const byState = STATE_ORDER[stateA] - STATE_ORDER[sprintState(b, now)]
    if (byState !== 0) return byState
    const byTime =
      stateA === "completed"
        ? timeOr(a.completedAt, LAST) - timeOr(b.completedAt, LAST)
        : timeOr(a.startsAt, LAST) - timeOr(b.startsAt, LAST)
    return byTime || a.createdAt.getTime() - b.createdAt.getTime()
  })
  const index = ordered.findIndex((sprint) => sprint.id === id)
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 ? (ordered[index + 1] ?? null) : null
  }
}

export function pickDefaultSprint(
  sprints: ReadonlyArray<Group>,
  now: Date = nowDate()
) {
  return (
    pickActiveSprint(sprints, now) ??
    pickEarliestPlannedSprint(sprints, now) ??
    null
  )
}

export const eligibleSprints = (sprints: ReadonlyArray<Group>) => {
  const now = nowDate()
  const stateOrder = { active: 0, planned: 1, completed: 2 } as const
  return sprints
    .filter((s) => s.completedAt === null)
    .toSorted((a, b) => {
      const sa = stateOrder[sprintState(a, now)]
      const sb = stateOrder[sprintState(b, now)]
      if (sa !== sb) return sa - sb
      return (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
    })
}
