import { Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { sprintOverview } from "./sprintOverview"

const decodeGroup = Schema.decodeSync(Group)

const sprint = (
  id: string,
  dates: Readonly<{
    startsAt?: string
    endsAt?: string
    completedAt?: string
    createdAt?: string
  }> = {}
) =>
  decodeGroup({
    id,
    name: id,
    kind: "sprint",
    tickets: [],
    color: "#777777",
    startsAt: dates.startsAt ?? null,
    endsAt: dates.endsAt ?? null,
    completedAt: dates.completedAt ?? null,
    createdBy: "viewer",
    createdAt: dates.createdAt ?? "2026-01-01",
    updatedAt: "2026-01-01"
  })

const now = DateTime.toDate(DateTime.makeUnsafe("2026-03-10T12:00:00"))

describe("sprintOverview", () => {
  it("orders upcoming by start date with unscheduled last, and completed newest first", () => {
    const overview = sprintOverview(
      [
        sprint("G-1", { startsAt: "2026-02-01", completedAt: "2026-02-14" }),
        sprint("G-2", { startsAt: "2026-02-15", completedAt: "2026-02-28" }),
        sprint("G-3", { startsAt: "2026-03-01" }),
        sprint("G-4", { createdAt: "2026-01-02" }),
        sprint("G-5", { startsAt: "2026-04-01" }),
        sprint("G-6", { startsAt: "2026-03-20" })
      ],
      now
    )
    expect(overview.active.map((s) => s.id)).toEqual(["G-3"])
    expect(overview.upcoming.map((s) => s.id)).toEqual(["G-6", "G-5", "G-4"])
    expect(overview.completed.map((s) => s.id)).toEqual(["G-2", "G-1"])
  })
})
