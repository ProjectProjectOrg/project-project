import {
  TicketRank,
  TicketId,
  TicketStatus,
  type EpicSectionKey,
  type Ticket,
  TypeKey
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import {
  type EpicSectionsData,
  firstScreenEpicSections,
  type EpicSectionValue
} from "./epicSectionRows"
import { FIRST_SCREEN_ROWS } from "./ticketRows"

const ticketId = Schema.decodeSync(TicketId)
const ticket = {
  id: ticketId("T-1"),
  title: "Estimate field",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: TypeKey.make("feat"),
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  rank: TicketRank.make("a0"),
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  estimate: null,
  flag: null,
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Ticket

const section = (
  key: EpicSectionKey,
  tickets: ReadonlyArray<Ticket>
): EpicSectionValue => ({
  key,
  parent: null,
  count: tickets.length,
  page: {
    items: tickets.map((t) => ({
      ticket: t,
      key: t.id,
      orderKey: null,
      pending: false
    })),
    nextCursor: null
  }
})

const grouped = (
  sections: ReadonlyArray<EpicSectionValue>
): EpicSectionsData => ({
  total: sections.reduce((sum, s) => sum + s.count, 0),
  counts: { total: 1, byStatus: { [ticket.status]: 1 } },
  sections
})

it("keeps the first screen's lines, counting each section's header", () => {
  const sections = Array.from({ length: FIRST_SCREEN_ROWS }, (_, index) =>
    section(ticketId(`T-${100 + index}`), [ticket, ticket, ticket])
  )
  const kept = firstScreenEpicSections(grouped(sections)).sections
  expect(kept.map((shown) => shown.page.items.length)).toEqual(
    Array.from({ length: FIRST_SCREEN_ROWS / 4 }, () => 3)
  )
})
