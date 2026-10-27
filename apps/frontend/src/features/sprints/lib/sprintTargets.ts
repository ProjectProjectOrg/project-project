import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  type Group
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
