import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group,
  type GroupId
} from "@pp/shared"

export function pickSprintNavigationTarget(
  sprints: ReadonlyArray<Group>
): Group | null {
  const active = pickActiveSprint(sprints)
  if (active) return active
  const planned = pickEarliestPlannedSprint(sprints)
  if (planned) return planned
  const completed = sprints
    .filter((s) => s.completedAt !== null)
    .toSorted(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
    )
  return completed[0] ?? null
}

export function pickRedirectTarget(
  sprints: ReadonlyArray<Group>
): Group | null {
  const active = pickActiveSprint(sprints)
  if (active) return active
  const planned = pickEarliestPlannedSprint(sprints)
  if (planned) return planned
  const completed = sprints
    .filter((s) => s.completedAt !== null)
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
    )
  return completed[0] ?? null
}

const STATE_ORDER = { completed: 0, active: 1, planned: 2 } as const

const timeOf = (date: Date | null) => date?.getTime() ?? Number.MAX_SAFE_INTEGER

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
        ? timeOf(a.completedAt) - timeOf(b.completedAt)
        : timeOf(a.startsAt) - timeOf(b.startsAt)
    return byTime || a.createdAt.getTime() - b.createdAt.getTime()
  })
  const index = ordered.findIndex((sprint) => sprint.id === id)
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 ? (ordered[index + 1] ?? null) : null
  }
}
