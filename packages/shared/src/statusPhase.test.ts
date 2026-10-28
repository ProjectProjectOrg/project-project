import { describe, expect, it } from "vitest"

import {
  finishedStatusSlugs,
  hasBaselineOrder,
  phaseEndNeighbors,
  statusPhaseOf
} from "./statusPhase"

const statuses = [
  { slug: "refine", orderKey: "Zz" },
  { slug: "todo", orderKey: "a0" },
  { slug: "in_progress", orderKey: "a1" },
  { slug: "review", orderKey: "a1V" },
  { slug: "done", orderKey: "a2" },
  { slug: "wont_do", orderKey: "a3" }
]

describe("statusPhaseOf", () => {
  it.each([
    ["refine", "unstarted"],
    ["todo", "unstarted"],
    ["in_progress", "started"],
    ["review", "started"],
    ["done", "finished"],
    ["wont_do", "finished"],
    ["missing", "unstarted"]
  ])("%s is %s", (slug, phase) => {
    expect(statusPhaseOf(statuses, slug)).toBe(phase)
  })

  it("keeps built-ins in their own phase when stored out of order", () => {
    const shuffled = [
      { slug: "done", orderKey: "a0" },
      { slug: "in_progress", orderKey: "a1" },
      { slug: "todo", orderKey: "a2" }
    ]
    expect(statusPhaseOf(shuffled, "todo")).toBe("unstarted")
    expect(statusPhaseOf(shuffled, "done")).toBe("finished")
  })
})

describe("finishedStatusSlugs", () => {
  it("collects done and every status after it", () => {
    expect([...finishedStatusSlugs(statuses)].toSorted()).toEqual([
      "done",
      "wont_do"
    ])
  })

  it("falls back to done when statuses are unknown", () => {
    expect([...finishedStatusSlugs([])]).toEqual(["done"])
  })
})

describe("hasBaselineOrder", () => {
  it("accepts todo before in progress before done", () => {
    expect(hasBaselineOrder(statuses)).toBe(true)
  })

  it("rejects done moved before in progress", () => {
    expect(
      hasBaselineOrder(
        statuses.map((s) => (s.slug === "done" ? { ...s, orderKey: "a0V" } : s))
      )
    ).toBe(false)
  })
})

describe("phaseEndNeighbors", () => {
  it("returns the keys around the end of a phase", () => {
    expect(phaseEndNeighbors(statuses, "unstarted")).toEqual(["a0", "a1"])
    expect(phaseEndNeighbors(statuses, "started")).toEqual(["a1V", "a2"])
    expect(phaseEndNeighbors(statuses, "finished")).toEqual(["a3", null])
  })
})
