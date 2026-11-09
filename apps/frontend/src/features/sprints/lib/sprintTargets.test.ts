import { Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { sprintNeighbours } from "./sprintTargets"

const decodeGroup = Schema.decodeSync(Group)

const sprint = (
  id: string,
  startsAt: string | null,
  completedAt: string | null = null
) =>
  decodeGroup({
    id,
    name: id,
    kind: "sprint",
    tickets: [],
    color: "#777777",
    startsAt,
    endsAt: null,
    completedAt,
    createdBy: "viewer",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01"
  })

describe("sprintNeighbours", () => {
  it("walks completed, then active, then planned sprints in time order", () => {
    const now = DateTime.toDate(DateTime.makeUnsafe("2026-09-13"))
    const done = sprint("G-1", "2026-08-01", "2026-08-15")
    const active = sprint("G-2", "2026-09-01")
    const scheduled = sprint("G-3", "2026-09-20")
    const unscheduled = sprint("G-4", null)
    const all = [unscheduled, scheduled, active, done]
    expect(sprintNeighbours(all, active.id, now)).toEqual({
      previous: done,
      next: scheduled
    })
    expect(sprintNeighbours(all, unscheduled.id, now)).toEqual({
      previous: scheduled,
      next: null
    })
  })
})
