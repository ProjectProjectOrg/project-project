import { sprintState, type Group } from "@pp/shared"

export const singleFilterValue = <A>(
  values: ReadonlyArray<A> | undefined
): A | "all" => (values?.length === 1 ? values[0] : "all")

export const singleFilter = <A extends string>(
  value: A | "all"
): ReadonlyArray<A> | undefined => (value === "all" ? undefined : [value])

export const toggledTags = <A>(
  selected: ReadonlyArray<A>,
  name: A
): ReadonlyArray<A> | undefined => {
  const next = selected.includes(name)
    ? selected.filter((tag) => tag !== name)
    : [...selected, name]
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
