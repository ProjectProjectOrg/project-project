import {
  EPIC_SECTION_NONE,
  TicketId,
  TicketStatus,
  type EpicSectionKey,
  type Ticket
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  patchEpicSectionsRow,
  replaceEpicSectionsRow,
  type EpicSectionsValue,
  type EpicSectionValue
} from "./epicSectionRows"

const ticketId = Schema.decodeSync(TicketId)
const epicId = ticketId("T-9")
const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z"))
const query = { sort: { key: "id", dir: "asc" } } as const

const ticket = {
  id: ticketId("T-1"),
  title: "Estimate field",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  estimate: null,
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
  title: null,
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
): EpicSectionsValue => ({
  total: sections.reduce((sum, s) => sum + s.count, 0),
  counts: { total: 1, byStatus: { [ticket.status]: 1 } },
  sections,
  viewer: { id: undefined, estimation: "off" }
})

const idsBySection = (value: EpicSectionsValue) =>
  value.sections.map((s) => ({
    key: s.key,
    count: s.count,
    ids: s.page.items.map((row) => row.ticket.id)
  }))

describe("epic grouping rows", () => {
  it("moves a row to its new epic's section while the edit is pending", () => {
    const value = grouped([
      section(epicId, []),
      section(EPIC_SECTION_NONE, [ticket])
    ])

    const patched = patchEpicSectionsRow(
      value,
      ticket.id,
      { parent: epicId },
      query,
      now
    )

    expect(idsBySection(patched)).toEqual([
      { key: epicId, count: 1, ids: [ticket.id] },
      { key: EPIC_SECTION_NONE, count: 0, ids: [] }
    ])
  })

  it("leaves rows in place when the grouping field is untouched", () => {
    const value = grouped([
      section(epicId, []),
      section(EPIC_SECTION_NONE, [ticket])
    ])

    const patched = patchEpicSectionsRow(
      value,
      ticket.id,
      { priority: "high" },
      query,
      now
    )

    expect(idsBySection(patched)).toEqual(idsBySection(value))
  })

  it("follows the server's copy when it lands in another section", () => {
    const value = grouped([
      section(epicId, []),
      section(EPIC_SECTION_NONE, [ticket])
    ])

    const replaced = replaceEpicSectionsRow(
      value,
      { ...ticket, parent: epicId },
      null,
      query.sort
    )

    expect(idsBySection(replaced)).toEqual([
      { key: epicId, count: 1, ids: [ticket.id] },
      { key: EPIC_SECTION_NONE, count: 0, ids: [] }
    ])
  })
})
