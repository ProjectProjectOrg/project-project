import { sprintState, type Group, type GroupId } from "@pp/shared"

import { timeOr } from "./sprintDates"

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
