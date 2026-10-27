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
  patchSectionsRow,
  replaceSectionsRow,
  type SectionsValue,
  type SectionValue
} from "./sectionRows"

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
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Ticket

type Section = SectionValue<EpicSectionKey>

const section = (
  key: EpicSectionKey,
  tickets: ReadonlyArray<Ticket>
): Section => ({
  key,
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

const grouped = (sections: ReadonlyArray<Section>): SectionsValue<Section> => ({
  total: sections.reduce((sum, s) => sum + s.count, 0),
  counts: { total: 1, byStatus: { [ticket.status]: 1 } },
  sections
})

const sectionOf = (t: Ticket): EpicSectionKey => t.parent ?? EPIC_SECTION_NONE

const idsBySection = (value: SectionsValue<Section>) =>
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

    const patched = patchSectionsRow(
      value,
      ticket.id,
      { parent: epicId },
      query,
      undefined,
      now,
      sectionOf
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

    const patched = patchSectionsRow(
      value,
      ticket.id,
      { priority: "high" },
      query,
      undefined,
      now,
      sectionOf
    )

    expect(idsBySection(patched)).toEqual(idsBySection(value))
  })

  it("follows the server's copy when it lands in another section", () => {
    const value = grouped([
      section(epicId, []),
      section(EPIC_SECTION_NONE, [ticket])
    ])

    const replaced = replaceSectionsRow(
      value,
      { ...ticket, parent: epicId },
      null,
      query.sort,
      sectionOf
    )

    expect(idsBySection(replaced)).toEqual([
      { key: epicId, count: 1, ids: [ticket.id] },
      { key: EPIC_SECTION_NONE, count: 0, ids: [] }
    ])
  })
})
