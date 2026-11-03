import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { type OverviewInput, summarize } from "./overview"

const statuses = [
  { slug: "todo", label: "Todo", orderKey: "a1" },
  { slug: "in_progress", label: "In progress", orderKey: "a2" },
  { slug: "done", label: "Done", orderKey: "a3" },
  { slug: "shipped", label: "Shipped", orderKey: "a4" }
]

const at = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))

const ticket = (id: string, status: string, createdAt: string) => ({
  id,
  status,
  createdAt: at(createdAt)
})

const input = (overrides: Partial<OverviewInput> = {}): OverviewInput => ({
  scope: "acme/web",
  statuses,
  tickets: [],
  sprint: undefined,
  now: DateTime.makeZonedUnsafe("2026-10-31T15:00:00Z", { timeZone: "UTC" }),
  ...overrides
})

describe("summarize", () => {
  it("counts sprint tickets by phase, with statuses after done as finished", () => {
    const overview = summarize(
      input({
        tickets: [
          ticket("T-1", "todo", "2026-10-01T10:00:00Z"),
          ticket("T-2", "in_progress", "2026-10-01T10:00:00Z"),
          ticket("T-3", "done", "2026-10-01T10:00:00Z"),
          ticket("T-4", "shipped", "2026-10-01T10:00:00Z"),
          ticket("T-5", "todo", "2026-10-01T10:00:00Z")
        ],
        sprint: {
          id: "G-1",
          name: "Sprint 1",
          tickets: ["T-1", "T-2", "T-3", "T-4"],
          endsAt: at("2026-11-03T00:00:00Z")
        }
      })
    )
    expect(overview.sprint).toMatchObject({
      unstarted: 1,
      started: 1,
      finished: 2,
      daysLeft: 3
    })
    expect(overview.statuses.map((status) => status.count)).toEqual([
      2, 1, 1, 1
    ])
  })

  it("counts tickets created per day from the Monday 11 weeks back to today", () => {
    const { created } = summarize(
      input({
        tickets: [
          ticket("T-1", "todo", "2026-08-10T09:00:00Z"),
          ticket("T-2", "todo", "2026-08-09T23:00:00Z"),
          ticket("T-3", "todo", "2026-10-31T08:00:00Z"),
          ticket("T-4", "todo", "2026-10-31T09:00:00Z")
        ]
      })
    )
    expect(created[0]).toEqual({ date: "2026-08-10", count: 1 })
    expect(created.at(-1)).toEqual({ date: "2026-10-31", count: 2 })
    expect(created).toHaveLength(11 * 7 + 6)
  })

  it("counts days past the end of an overdue sprint as negative", () => {
    const overview = summarize(
      input({
        sprint: {
          id: "G-1",
          name: "Sprint 1",
          tickets: [],
          endsAt: at("2026-10-28T00:00:00Z")
        }
      })
    )
    expect(overview.sprint?.daysLeft).toBe(-3)
  })
})
