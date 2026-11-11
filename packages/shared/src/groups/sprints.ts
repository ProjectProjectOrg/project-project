import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"

import type { Group, GroupId } from "./Group"

const nowDate = (): Date => DateTime.toDate(DateTime.nowUnsafe())

export const SprintState = Schema.Literals(["active", "planned", "completed"])
export type SprintState = typeof SprintState.Type

export function sprintState(sprint: Group, now: Date = nowDate()): SprintState {
  if (sprint.completedAt !== null) return "completed"
  if (sprint.startsAt === null || sprint.startsAt > now) return "planned"
  return "active"
}

const compareCreatedAt = (a: Group, b: Group) =>
  a.createdAt.getTime() - b.createdAt.getTime()

const compareStartsThenCreated = (a: Group, b: Group) => {
  const ta = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY
  const tb = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY
  if (ta !== tb) return ta - tb
  return compareCreatedAt(a, b)
}

const onlySprints = (groups: ReadonlyArray<Group>): ReadonlyArray<Group> =>
  groups.filter((g) => g.kind === "sprint")

export function pickActiveSprint(
  groups: ReadonlyArray<Group>,
  now: Date = nowDate()
): Group | null {
  const active = onlySprints(groups).filter(
    (g) => sprintState(g, now) === "active"
  )
  if (active.length === 0) return null
  return [...active].sort(compareStartsThenCreated)[0]
}

export function pickEarliestPlannedSprint(
  groups: ReadonlyArray<Group>,
  now: Date = nowDate()
): Group | null {
  const planned = onlySprints(groups).filter(
    (g) => sprintState(g, now) === "planned"
  )
  if (planned.length === 0) return null
  return [...planned].sort(compareStartsThenCreated)[0]
}

export function activeAndPlannedCount(
  groups: ReadonlyArray<Group>,
  now: Date = nowDate()
): number {
  return onlySprints(groups).filter((g) => sprintState(g, now) !== "completed")
    .length
}

export function backlogSprintSections(
  sprints: ReadonlyArray<Group>,
  selected?: ReadonlyArray<GroupId | "ungrouped">,
  now: Date = nowDate()
): ReadonlyArray<Group | null> {
  const rank = { planned: 0, active: 1, completed: 2 }
  const ordered = sprints.toSorted((a, b) => {
    const stateOrder = rank[sprintState(a, now)] - rank[sprintState(b, now)]
    if (stateOrder !== 0) return stateOrder
    const dateOrder =
      (a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
    return dateOrder || a.id.localeCompare(b.id)
  })
  const sections = [
    ...ordered.filter((sprint) => sprintState(sprint, now) === "planned"),
    null,
    ...ordered.filter((sprint) => sprintState(sprint, now) !== "planned")
  ]
  return selected?.length
    ? sections.filter((sprint) => selected.includes(sprint?.id ?? "ungrouped"))
    : sections
}
