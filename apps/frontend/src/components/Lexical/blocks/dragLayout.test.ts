import { describe, expect, it } from "vitest"

import {
  dragLayout,
  dropPlacement,
  insertionIndexAt,
  isNoopInsertion,
  type DragSlot
} from "./dragLayout"

const SLOTS: ReadonlyArray<DragSlot> = [
  { key: "a", top: 0, height: 40 },
  { key: "b", top: 50, height: 100 },
  { key: "c", top: 160, height: 20 },
  { key: "d", top: 190, height: 60 }
]

describe("insertionIndexAt", () => {
  it("counts the midpoints above the pointer, skipping the dragged slot", () => {
    expect(insertionIndexAt(SLOTS, 1, -10)).toBe(0)
    expect(insertionIndexAt(SLOTS, 1, 30)).toBe(2)
    expect(insertionIndexAt(SLOTS, 1, 175)).toBe(3)
    expect(insertionIndexAt(SLOTS, 1, 500)).toBe(4)
  })

  it("treats both edges of the dragged slot as staying put", () => {
    expect(isNoopInsertion(1, insertionIndexAt(SLOTS, 1, 25))).toBe(true)
    expect(isNoopInsertion(1, insertionIndexAt(SLOTS, 1, 165))).toBe(true)
    expect(isNoopInsertion(1, 0)).toBe(false)
    expect(isNoopInsertion(1, 3)).toBe(false)
  })
})

describe("dragLayout", () => {
  it("leaves everything in place for a no-op", () => {
    expect(dragLayout(SLOTS, 1, 2)).toEqual({ shifts: new Map(), ghostTop: 50 })
  })

  it("moves the slots it passes up by the dragged pitch when moving down", () => {
    const layout = dragLayout(SLOTS, 1, 4)
    expect(layout.shifts.get("a")).toBeUndefined()
    expect(layout.shifts.get("c")).toBe(-110)
    expect(layout.shifts.get("d")).toBe(-110)
    expect(layout.ghostTop).toBe(150)
    expect(layout.shifts.get("b")).toBe(100)
  })

  it("moves the slots it passes down when moving up", () => {
    const layout = dragLayout(SLOTS, 2, 0)
    expect(layout.shifts.get("a")).toBe(30)
    expect(layout.shifts.get("b")).toBe(30)
    expect(layout.shifts.get("d")).toBeUndefined()
    expect(layout.ghostTop).toBe(0)
    expect(layout.shifts.get("c")).toBe(-160)
  })

  it("gives the ghost the dragged block's height at the landing spot", () => {
    const layout = dragLayout(SLOTS, 0, 2)
    const gapBelowGhost = SLOTS[2].top - (layout.ghostTop + SLOTS[0].height)
    expect(layout.ghostTop).toBe(110)
    expect(gapBelowGhost).toBe(SLOTS[1].top - SLOTS[0].height)
  })
})

describe("dropPlacement", () => {
  it("drops before the slot at the index, or after the last one", () => {
    expect(dropPlacement(SLOTS, 1, 0)).toEqual({
      key: "a",
      placement: "before"
    })
    expect(dropPlacement(SLOTS, 1, 3)).toEqual({
      key: "d",
      placement: "before"
    })
    expect(dropPlacement(SLOTS, 1, 4)).toEqual({ key: "d", placement: "after" })
  })

  it("returns nothing for a drop onto itself", () => {
    expect(dropPlacement(SLOTS, 1, 1)).toBeNull()
    expect(dropPlacement(SLOTS, 1, 2)).toBeNull()
  })
})
