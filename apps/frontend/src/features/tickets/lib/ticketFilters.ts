import { sprintState, type Group } from "@pp/shared"

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
  now: Date
): ReadonlyArray<Group> =>
  sprints.filter((sprint) => {
    const state = sprintState(sprint, now)
    return state === "active" || state === "planned"
  })
