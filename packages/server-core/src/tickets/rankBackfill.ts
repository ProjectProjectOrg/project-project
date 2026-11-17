import { pickActiveSprint, sprintState, type Group } from "@pp/shared"

export type UnrankedTicket = Readonly<{
  id: string
  createdAt: number
  sprint: string | null
}>

const newestFirst = (a: UnrankedTicket, b: UnrankedTicket) =>
  b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)

const startsThenCreated = (a: Group, b: Group) =>
  (a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY) -
    (b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
  a.createdAt.getTime() - b.createdAt.getTime() ||
  (a.id < b.id ? -1 : 1)

export const initialRankOrder = (
  groups: ReadonlyArray<Group>,
  tickets: ReadonlyArray<UnrankedTicket>,
  now: Date
): ReadonlyArray<string> => {
  const active = pickActiveSprint(groups, now)
  const planned = groups
    .filter(
      (group) =>
        group.kind === "sprint" && sprintState(group, now) === "planned"
    )
    .toSorted(startsThenCreated)
  const sprints = [...(active === null ? [] : [active]), ...planned]
  const sorted = tickets.toSorted(newestFirst)
  const sprintOrder = sprints.flatMap((sprint) =>
    sorted.filter((ticket) => ticket.sprint === sprint.id)
  )
  const placed = new Set(sprintOrder)
  return [
    ...sprintOrder,
    ...sorted.filter((ticket) => !placed.has(ticket))
  ].map((ticket) => ticket.id)
}
