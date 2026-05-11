import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import type { Ticket, TicketFilter } from "@projectproject/shared"
import { TagName, TicketId } from "@projectproject/shared"
import { matchesTicketFilter } from "./TicketFilters"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeTagName = Schema.decodeUnknownSync(TagName)
const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))

const baseTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: decodeTicketId("T-1"),
  title: "Test",
  status: "todo",
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "user-1",
  createdAt: isoDate("2026-05-01T00:00:00.000Z"),
  updatedAt: isoDate("2026-05-10T00:00:00.000Z"),
  ...overrides
})

describe("matchesTicketFilter", () => {
  it("undefined filter matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), undefined)).toBe(true)
  })

  it("empty filter object matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), {})).toBe(true)
  })

  it("status filter ORs across entries", () => {
    const t = baseTicket({ status: "in_progress" })
    const f: TicketFilter = { status: ["in_progress", "done"] }
    expect(matchesTicketFilter(t, f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ status: "todo" }), f)).toBe(false)
  })

  it("empty status array matches nothing", () => {
    expect(matchesTicketFilter(baseTicket(), { status: [] })).toBe(false)
  })

  it("type filter ORs across entries", () => {
    const f: TicketFilter = { type: ["bug"] }
    expect(matchesTicketFilter(baseTicket({ type: "bug" }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ type: "feat" }), f)).toBe(false)
  })

  it("assignee: null entry matches unassigned tickets", () => {
    const t = baseTicket({ assignees: [] })
    expect(matchesTicketFilter(t, { assignee: [null] })).toBe(true)
    expect(matchesTicketFilter(t, { assignee: ["alice"] })).toBe(false)
  })

  it("assignee mix matches union of unassigned + named", () => {
    const f: TicketFilter = { assignee: [null, "alice"] }
    expect(matchesTicketFilter(baseTicket({ assignees: [] }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ assignees: ["alice"] }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ assignees: ["bob"] }), f)).toBe(false)
  })

  it("tags filter ORs across entries (any tag in common wins)", () => {
    const t = baseTicket({ tags: [decodeTagName("bug"), decodeTagName("perf")] })
    expect(matchesTicketFilter(t, { tags: [decodeTagName("bug")] })).toBe(true)
    expect(matchesTicketFilter(t, { tags: [decodeTagName("ui")] })).toBe(false)
  })

  it("hasBranch true requires non-null branch", () => {
    expect(matchesTicketFilter(baseTicket({ branch: "feat/x" }), { hasBranch: true })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: true })).toBe(false)
  })

  it("hasBranch false requires null branch", () => {
    expect(matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: false })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ branch: "feat/x" }), { hasBranch: false })).toBe(false)
  })

  it("hasPr mirrors hasBranch against pr", () => {
    expect(matchesTicketFilter(baseTicket({ pr: 7 }), { hasPr: true })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ pr: null }), { hasPr: true })).toBe(false)
  })

  it("updatedAfter is strict greater-than", () => {
    const t = baseTicket({ updatedAt: isoDate("2026-05-10T00:00:00.000Z") })
    expect(matchesTicketFilter(t, { updatedAfter: isoDate("2026-05-09T00:00:00.000Z") })).toBe(true)
    expect(matchesTicketFilter(t, { updatedAfter: isoDate("2026-05-10T00:00:00.000Z") })).toBe(false)
    expect(matchesTicketFilter(t, { updatedAfter: isoDate("2026-05-11T00:00:00.000Z") })).toBe(false)
  })

  it("ANDs across fields", () => {
    const t = baseTicket({ status: "in_progress", type: "bug" })
    expect(matchesTicketFilter(t, { status: ["in_progress"], type: ["bug"] })).toBe(true)
    expect(matchesTicketFilter(t, { status: ["in_progress"], type: ["feat"] })).toBe(false)
  })
})
