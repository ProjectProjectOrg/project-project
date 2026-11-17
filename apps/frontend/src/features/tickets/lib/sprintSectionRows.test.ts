import {
  GroupColor,
  GroupId,
  SPRINT_SECTION_UNSCHEDULED,
  sprintSectionKey,
  TicketStatus,
  type Group
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { firstScreenSprintPages } from "./sprintSectionRows"
import { placeholderRow, type TicketRowPage } from "./ticketRows"

const date = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const groupId = Schema.decodeSync(GroupId)
const groupColor = Schema.decodeSync(GroupColor)

const sprint = (id: string, startsAt: Date | null): Group => ({
  id: groupId(id),
  name: id,
  kind: "sprint",
  tickets: [],
  color: groupColor("#777777"),
  startsAt,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: date("2026-01-01T00:00:00.000Z"),
  updatedAt: date("2026-01-01T00:00:00.000Z")
})

const page = (size: number): TicketRowPage => ({
  items: Array.from({ length: size }, (_, index) =>
    placeholderRow(
      {
        payload: { title: `${index}` },
        prediction: {
          clientId: `${index}`,
          createdBy: "user-1",
          projectPrefix: "T",
          estimation: "off"
        }
      },
      [],
      TicketStatus.make("todo"),
      date("2026-01-01T00:00:00.000Z")
    )
  ),
  nextCursor: "next"
})

it("spends the first screen's rows on sections that open expanded", () => {
  const active = sprint("G-1", date("2020-01-01T00:00:00.000Z"))
  const planned = sprint("G-2", null)
  const pages = firstScreenSprintPages(
    [
      { key: sprintSectionKey(active.id), page: page(30) },
      { key: sprintSectionKey(planned.id), page: page(30) },
      { key: SPRINT_SECTION_UNSCHEDULED, page: page(30) }
    ],
    [active, planned],
    undefined
  )
  expect(pages.map((shown) => shown.items.length)).toEqual([0, 30, 10])
})
