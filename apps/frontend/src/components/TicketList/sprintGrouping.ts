import { sprintState, type Group, type GroupId } from "@pp/shared"
import * as DateTime from "effect/DateTime"

export function backlogSprintSections(
  sprints: ReadonlyArray<Group>,
  selected?: ReadonlyArray<GroupId | "ungrouped">,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
): ReadonlyArray<Group | null> {
  const ordered = sprints.toSorted((a, b) => {
    const rank = { planned: 0, active: 1, completed: 2 }
    const stateOrder = rank[sprintState(a, now)] - rank[sprintState(b, now)]
    if (stateOrder !== 0) return stateOrder
    const dateOrder =
      (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
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
