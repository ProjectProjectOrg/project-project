import { Estimate } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  averageDone,
  loadByAssignee,
  planTotals,
  usualDone
} from "./sprintPlan"

const decodeEstimate = Schema.decodeSync(Estimate)
const points = { kind: "estimate", unit: "points" } as const

const ticket = (
  value: number | null,
  assignees: ReadonlyArray<string> = [],
  status = "todo"
) => ({
  estimate: value === null ? null : decodeEstimate({ unit: "points", value }),
  assignees,
  status
})

describe("planTotals", () => {
  it("adds estimates and counts the tickets that have none", () => {
    expect(planTotals([ticket(3), ticket(5), ticket(null)], points)).toEqual({
      committed: 8,
      unestimated: 1
    })
  })
})

describe("averageDone", () => {
  it("averages only finished work across sprints, with no basis when nothing finished", () => {
    const phaseOf = (status: string) =>
      status === "done" ? ("finished" as const) : ("unstarted" as const)
    const sprints = [
      [ticket(5, [], "done"), ticket(8, [], "todo")],
      [ticket(10, [], "done")]
    ]
    expect(averageDone(sprints, points, phaseOf)).toBe(8)
    expect(averageDone([[ticket(5)]], points, phaseOf)).toBeNull()
  })
})

describe("loadByAssignee", () => {
  it("credits shared tickets to each assignee and lists unassigned last", () => {
    expect(
      loadByAssignee(
        [ticket(3, ["a"]), ticket(5, ["a", "b"]), ticket(8)],
        points
      )
    ).toEqual([
      { assignee: "a", amount: 8, tickets: 2 },
      { assignee: "b", amount: 5, tickets: 1 },
      { assignee: null, amount: 8, tickets: 1 }
    ])
  })
})

describe("usualDone", () => {
  const phaseOf = (status: string) =>
    status === "done" ? ("finished" as const) : ("unstarted" as const)

  it("averages one person's finished work, and needs two sprints of history", () => {
    const sprints = [
      [ticket(4, ["a"], "done"), ticket(9, ["b"], "done")],
      [ticket(6, ["a", "b"], "done"), ticket(5, ["a"], "todo")]
    ]
    expect(usualDone(sprints, points, phaseOf, "a")).toBe(5)
    expect(usualDone(sprints.slice(0, 1), points, phaseOf, "a")).toBeNull()
  })
})
