import { describe, expect, it } from "vitest"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { Group } from "@projectproject/shared"
import { backlogSprintSections } from "./sprintGrouping"

const sprint = (
  id: string,
  startsAt: string | null,
  completedAt: string | null = null
) =>
  Schema.decodeSync(Group)({
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
const planned = sprint("G-1", "2026-09-20")
const later = sprint("G-2", "2026-09-27")
const active = sprint("G-3", null)
const completed = sprint("G-4", "2026-08-01", "2026-08-15")
const now = DateTime.toDate(DateTime.makeUnsafe("2026-09-13"))

describe("backlog sprint sections", () => {
  it("orders planned sprints chronologically before unscheduled, active, and completed", () => {
    expect(
      backlogSprintSections([completed, later, active, planned], undefined, now)
    ).toEqual([planned, later, null, active, completed])
  })
  it("keeps an unscheduled container when there are no sprints", () => {
    expect(backlogSprintSections([], undefined, now)).toEqual([null])
  })
  it("honors explicit sprint and unassigned filters without inventing sections", () => {
    const sprints = [planned, active, completed]
    expect(
      backlogSprintSections(sprints, [planned.id, "ungrouped"], now)
    ).toEqual([planned, null])
    expect(backlogSprintSections(sprints, [completed.id], now)).toEqual([
      completed
    ])
    expect(backlogSprintSections(sprints, [later.id], now)).toEqual([])
  })
})
