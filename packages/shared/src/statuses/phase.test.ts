import { describe, expect, it } from "vitest"

import {
  compareStatuses,
  finishedStatusSlugs,
  lastKeyInPhase,
  phasesFromOrder,
  statusPhaseOf
} from "./phase"

const statuses = [
  { slug: "todo", phase: "unstarted", orderKey: "a0" },
  { slug: "in_progress", phase: "started", orderKey: "a0" },
  { slug: "wont_do", phase: "finished", orderKey: "a0" },
  { slug: "done", phase: "finished", orderKey: "a1" }
] as const

describe("statusPhaseOf", () => {
  it("reads the phase stored on the status", () => {
    expect(statusPhaseOf(statuses, "wont_do")).toBe("finished")
  })

  it("falls back to the built-in phase, then to unstarted", () => {
    expect(statusPhaseOf([], "done")).toBe("finished")
    expect(statusPhaseOf([], "missing")).toBe("unstarted")
  })
})

describe("finishedStatusSlugs", () => {
  it("collects every finished status, done included when unknown", () => {
    expect([...finishedStatusSlugs(statuses)].toSorted()).toEqual([
      "done",
      "wont_do"
    ])
    expect([...finishedStatusSlugs([])]).toEqual(["done"])
  })
})

describe("compareStatuses", () => {
  it("orders by phase, then by key within the phase", () => {
    expect(
      [...statuses]
        .reverse()
        .toSorted(compareStatuses)
        .map((s) => s.slug)
    ).toEqual(["todo", "in_progress", "wont_do", "done"])
  })
})

describe("lastKeyInPhase", () => {
  it("returns the highest key in the phase, or null when it is empty", () => {
    expect(lastKeyInPhase(statuses, "finished")).toBe("a1")
    expect(lastKeyInPhase([], "started")).toBeNull()
  })
})

describe("phasesFromOrder", () => {
  const phaseOf = phasesFromOrder([
    { slug: "refine", orderKey: "Zz" },
    { slug: "todo", orderKey: "a0" },
    { slug: "in_progress", orderKey: "a1" },
    { slug: "review", orderKey: "a1V" },
    { slug: "done", orderKey: "a2" },
    { slug: "wont_do", orderKey: "a3" }
  ])

  it.each([
    ["refine", "unstarted"],
    ["review", "started"],
    ["wont_do", "finished"],
    ["done", "finished"]
  ])(
    "reads %s as %s from where it sits around the built-ins",
    (slug, phase) => {
      expect(phaseOf(slug)).toBe(phase)
    }
  )
})
