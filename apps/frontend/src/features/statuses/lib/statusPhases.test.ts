import { ProjectStatus, StatusSlug } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  boardReorders,
  keepsBaselineOrder,
  moveStatus,
  phaseEntries,
  placeStatus,
  type PhaseEntry
} from "./statusPhases"

const decode = Schema.decodeSync(ProjectStatus)

const status = (slug: string, orderKey: string): ProjectStatus =>
  decode({
    slug,
    label: slug,
    icon: "Circle",
    color: "#123456",
    orderKey,
    description: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })

const statuses = [
  status("refine", "Zz"),
  status("todo", "a0"),
  status("in_progress", "a1"),
  status("review", "a1V"),
  status("done", "a2"),
  status("wont_do", "a3")
]

const describeEntries = (entries: ReadonlyArray<PhaseEntry>) =>
  entries.map((entry) =>
    entry.kind === "status" ? entry.status.slug : `${entry.kind}:${entry.phase}`
  )

const moveTo = (slug: string, beforeIndex: number) => {
  const entries = [...phaseEntries(statuses)]
  const at = entries.findIndex(
    (e) => e.kind === "status" && e.status.slug === slug
  )
  const [moved] = entries.splice(at, 1)
  entries.splice(beforeIndex > at ? beforeIndex - 1 : beforeIndex, 0, moved)
  return entries
}

describe("phaseEntries", () => {
  it("groups statuses under their phase", () => {
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

  it("moves a status into another phase", () => {
    const key = placeStatus(moveTo("refine", 6), "refine")
    expect(key! > "a1V" && key! < "a2").toBe(true)
  })

  it("keeps a dropped status after the anchor of its phase", () => {
    const key = placeStatus(moveTo("refine", 7), "refine")
    expect(key! > "a2" && key! < "a3").toBe(true)
  })

  it("keeps todo in the not started phase", () => {
    expect(placeStatus(moveTo("todo", 6), "todo")).toBeNull()
    const key = placeStatus(moveTo("todo", 1), "todo")
    expect(key! < "Zz").toBe(true)
  })

  it("never moves the in progress and done anchors", () => {
    expect(placeStatus(moveTo("done", 1), "done")).toBeNull()
  })
})

describe("moveStatus", () => {
  it("moves up out of a phase past its anchor", () => {
    const key = moveStatus(phaseEntries(statuses), "review", -1)
    expect(key! > "a0" && key! < "a1").toBe(true)
  })

  it("moves down into the next phase after its anchor", () => {
    const key = moveStatus(phaseEntries(statuses), "review", 1)
    expect(key! > "a2" && key! < "a3").toBe(true)
  })

  it("stops at the end of the list", () => {
    expect(moveStatus(phaseEntries(statuses), "wont_do", 1)).toBeNull()
  })
})

describe("keepsBaselineOrder", () => {
  it("allows custom statuses anywhere around the built-ins", () => {
    expect(
      keepsBaselineOrder(["review", "todo", "in_progress", "wont_do", "done"])
    ).toBe(true)
  })

  it("rejects a built-in passing another", () => {
    expect(keepsBaselineOrder(["todo", "done", "in_progress"])).toBe(false)
  })
})

const slugs = (...values: ReadonlyArray<string>) =>
  values.map((value) => StatusSlug.make(value))

describe("boardReorders", () => {
  const board = [
    status("todo", "a0"),
    status("in_progress", "a1"),
    status("done", "a2"),
    status("review", "a3")
  ]

  it("moves only custom statuses so built-ins never pass each other", () => {
    const updates = boardReorders(
      slugs("review", "todo", "in_progress", "done"),
      board
    )
    expect(updates.map((u) => u.statusSlug)).toEqual(["review"])
    expect(updates[0].orderKey < "a0").toBe(true)
  })

  it("places a custom status between the built-ins it was dropped between", () => {
    const updates = boardReorders(
      slugs("todo", "review", "in_progress", "done"),
      board
    )
    expect(updates.map((u) => u.statusSlug)).toEqual(["review"])
    expect(updates[0].orderKey > "a0" && updates[0].orderKey < "a1").toBe(true)
  })
})
