import { ProjectStatus, StatusSlug, type StatusPhase } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  boardReorders,
  keepsPhases,
  moveStatus,
  phaseEntries,
  placeStatus,
  PhaseEntry
} from "./statusPhases"

const decode = Schema.decodeSync(ProjectStatus)

const status = (slug: string, phase: StatusPhase, orderKey: string) =>
  decode({
    slug,
    label: slug,
    icon: "Circle",
    color: "#123456",
    phase,
    orderKey,
    description: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })

const statuses = [
  status("refine", "unstarted", "Zz"),
  status("todo", "unstarted", "a0"),
  status("in_progress", "started", "a0"),
  status("review", "started", "a1"),
  status("done", "finished", "a0"),
  status("wont_do", "finished", "a1")
]

const describeEntries = (entries: ReadonlyArray<PhaseEntry>) =>
  entries.map((entry) =>
    PhaseEntry.$match(entry, {
      status: ({ status }) => status.slug,
      phase: ({ phase }) => `phase:${phase}`
    })
  )

const moveTo = (slug: string, beforeIndex: number) => {
  const entries = [...phaseEntries(statuses)]
  const at = entries.findIndex(
    (e) => PhaseEntry.$is("status")(e) && e.status.slug === slug
  )
  const [moved] = entries.splice(at, 1)
  entries.splice(beforeIndex > at ? beforeIndex - 1 : beforeIndex, 0, moved)
  return entries
}

describe("phaseEntries", () => {
  it("groups statuses under their stored phase", () => {
    expect(describeEntries(phaseEntries(statuses))).toEqual([
      "phase:unstarted",
      "refine",
      "todo",
      "phase:started",
      "in_progress",
      "review",
      "phase:finished",
      "done",
      "wont_do"
    ])
  })
})

describe("placeStatus", () => {
  it("returns null when the status did not move", () => {
    expect(placeStatus(phaseEntries(statuses), "review")).toBeNull()
  })

  it("moves a status into the phase it was dropped in", () => {
    const placed = placeStatus(moveTo("refine", 5), "refine")
    expect(placed?.phase).toBe("started")
    expect(placed!.orderKey > "a0" && placed!.orderKey < "a1").toBe(true)
  })

  it("places a status before done in the finished phase", () => {
    const placed = placeStatus(moveTo("review", 7), "review")
    expect(placed?.phase).toBe("finished")
    expect(placed!.orderKey < "a0").toBe(true)
  })

  it("reorders a built-in within its phase but never out of it", () => {
    expect(placeStatus(moveTo("done", 9), "done")?.phase).toBe("finished")
    expect(placeStatus(moveTo("done", 4), "done")).toBeNull()
  })
})

describe("moveStatus", () => {
  it("moves a status up one place, but never a built-in out of its phase", () => {
    expect(moveStatus(phaseEntries(statuses), "in_progress", -1)).toBeNull()
    const placed = moveStatus(phaseEntries(statuses), "wont_do", -1)
    expect(placed?.phase).toBe("finished")
    expect(placed!.orderKey < "a0").toBe(true)
  })

  it("stops at the end of the list", () => {
    expect(moveStatus(phaseEntries(statuses), "wont_do", 1)).toBeNull()
  })
})

const slugs = (...values: ReadonlyArray<string>) =>
  values.map((value) => StatusSlug.make(value))

describe("keepsPhases", () => {
  it("rejects an order that moves a status across a phase", () => {
    expect(keepsPhases(slugs("todo", "review", "in_progress"), statuses)).toBe(
      true
    )
    expect(keepsPhases(slugs("review", "todo", "in_progress"), statuses)).toBe(
      false
    )
  })
})

describe("boardReorders", () => {
  it("re-keys as few statuses as it can, each within its own phase", () => {
    const updates = boardReorders(
      slugs("refine", "todo", "review", "in_progress", "wont_do", "done"),
      statuses
    )
    expect(updates.map((u) => [u.statusSlug, u.phase])).toEqual([
      ["in_progress", "started"],
      ["done", "finished"]
    ])
    expect(updates.every((u) => u.orderKey > "a1")).toBe(true)
  })
})
