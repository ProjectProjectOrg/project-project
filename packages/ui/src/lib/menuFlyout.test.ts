import { describe, expect, it, vi } from "vitest"

import {
  createFlyoutLevel,
  matchesQuery,
  placeFlyout,
  typeaheadIndex
} from "./menuFlyout"

const viewport = { width: 1000, height: 800 }
const popup = { left: 100, top: 100, width: 200, height: 400 }
const place = (overrides: Partial<Parameters<typeof placeFlyout>[0]> = {}) =>
  placeFlyout({
    popup,
    trigger: { top: 140 },
    panel: { width: 180, height: 200 },
    viewport,
    gap: 2,
    inset: 5,
    margin: 5,
    ...overrides
  })

describe("placeFlyout", () => {
  it("opens to the right with its first row level with the trigger row", () => {
    expect(place()).toEqual({ side: "right", top: 135, maxHeight: 790 })
  })

  it("flips left when the right side has no room and the left has more", () => {
    const right = { left: 700, top: 100, width: 200, height: 400 }
    expect(place({ popup: right }).side).toBe("left")
  })

  it("stays right when neither side fits and the right has more room", () => {
    const wide = { width: 900, height: 200 }
    expect(place({ panel: wide }).side).toBe("right")
  })

  it("shifts up to stay inside the bottom of the viewport", () => {
    expect(place({ trigger: { top: 700 } }).top).toBe(595)
  })

  it("caps a panel taller than the viewport and pins it to the top margin", () => {
    const tall = place({ panel: { width: 180, height: 2000 } })
    expect(tall).toEqual({ side: "right", top: 5, maxHeight: 790 })
  })
})

describe("matchesQuery", () => {
  it("matches a substring ignoring case, accents and punctuation", () => {
    expect(matchesQuery("Renée O'Brien", "renee")).toBe(true)
    expect(matchesQuery("Renée O'Brien", "o-brien")).toBe(true)
    expect(matchesQuery("frontend", "END")).toBe(true)
  })

  it("trims the query and lets an empty one match everything", () => {
    expect(matchesQuery("frontend", "  front ")).toBe(true)
    expect(matchesQuery("frontend", "   ")).toBe(true)
  })

  it("rejects text that does not contain the query", () => {
    expect(matchesQuery("frontend", "backend")).toBe(false)
    expect(matchesQuery("ab", "abc")).toBe(false)
  })
})

describe("typeaheadIndex", () => {
  const labels = ["Backlog", "Todo", "In progress", "Done", "Duplicate"]

  it("finds the next row starting with a typed letter, after the current one", () => {
    expect(typeaheadIndex(labels, -1, "d")).toBe(3)
    expect(typeaheadIndex(labels, 3, "d")).toBe(4)
    expect(typeaheadIndex(labels, 4, "d")).toBe(3)
  })

  it("matches a longer prefix from the current row on", () => {
    expect(typeaheadIndex(labels, 3, "du")).toBe(4)
    expect(typeaheadIndex(labels, 3, "do")).toBe(3)
  })

  it("returns -1 when nothing matches", () => {
    expect(typeaheadIndex(labels, 0, "x")).toBe(-1)
  })
})

describe("createFlyoutLevel", () => {
  const level = (held = false) => {
    const exits: Array<string> = []
    const value = createFlyoutLevel(
      () => held,
      (exit) => exits.push(exit)
    )
    return { level: value, exits }
  }

  it("keeps one submenu open and tells both sides of a switch", () => {
    const { level: subject, exits } = level()
    const a = vi.fn()
    const b = vi.fn()
    subject.watch("a", a)
    subject.watch("b", b)
    expect(subject.open("a")).toBe(true)
    expect(subject.open("b")).toBe(true)
    expect(subject.active()).toBe("b")
    expect(a.mock.calls).toEqual([[true], [false]])
    expect(b.mock.calls).toEqual([[true]])
    expect(exits).toEqual(["instant", "instant"])
  })

  it("fades or cuts on close, and ignores a repeated open", () => {
    const { level: subject, exits } = level()
    const listener = vi.fn()
    subject.subscribe(listener)
    subject.open("a")
    expect(subject.open("a")).toBe(false)
    subject.close("fade")
    expect(subject.active()).toBeNull()
    expect(exits).toEqual(["instant", "fade"])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("releases only the submenu that is open", () => {
    const { level: subject } = level()
    subject.open("a")
    expect(subject.release("b", "instant")).toBe(false)
    expect(subject.active()).toBe("a")
    expect(subject.release("a", "instant")).toBe(true)
    expect(subject.active()).toBeNull()
  })

  it("neither closes nor switches while the menu is held", () => {
    let held = false
    const subject = createFlyoutLevel(
      () => held,
      () => {}
    )
    subject.open("a")
    held = true
    expect(subject.close("fade")).toBe(false)
    expect(subject.open("b")).toBe(false)
    expect(subject.active()).toBe("a")
  })
})
