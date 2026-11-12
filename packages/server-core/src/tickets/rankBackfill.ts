import { pickActiveSprint, sprintState, type Group } from "@pp/shared"

export type UnrankedTicket = Readonly<{ id: string; createdAt: number }>

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
  const unranked = new Set(tickets.map((ticket) => ticket.id))
  const sprintOrder = [...(active === null ? [] : [active]), ...planned]
    .flatMap((sprint) => sprint.tickets)
    .filter((id) => unranked.delete(id))
  const backlog = tickets
    .filter((ticket) => unranked.has(ticket.id))
    .toSorted((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
    .map((ticket) => ticket.id)
  return [...sprintOrder, ...backlog]
}
