import {
  sprintSectionKey,
  sprintState,
  type Group,
  type SprintSectionKey
} from "@pp/shared"

import { firstScreenPages, type TicketRowPage } from "./ticketRows"

export const sprintCollapsedByDefault = (
  sprint: Group | null,
  q: string | undefined
) => !q && sprint !== null && sprintState(sprint) !== "planned"

export const firstScreenSprintPages = (
  sections: ReadonlyArray<
    Readonly<{ key: SprintSectionKey; page: TicketRowPage }>
  >,
  sprints: ReadonlyArray<Group>,
  q: string | undefined
): ReadonlyArray<TicketRowPage> => {
  const byKey = new Map(
    sprints.map((sprint) => [sprintSectionKey(sprint.id), sprint])
  )
  return firstScreenPages(
    sections.map((section) => section.page),
    (index) => {
      const key = sections[index]?.key
      return !sprintCollapsedByDefault(
        key === undefined ? null : (byKey.get(key) ?? null),
        q
      )
    }
  )
}
