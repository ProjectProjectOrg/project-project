import { describe, expect, it } from "vitest"

import {
  aimsAt,
  nextHighlight,
  settleHighlight,
  type HighlightRect
} from "./menu-highlight"

const rect = (top: number) =>
  ({
    top,
    left: 4,
    width: 200,
    height: 32,
    tone: "default"
  }) satisfies HighlightRect

describe("nextHighlight", () => {
  it("keeps the session while the highlight moves between rows", () => {
    const first = nextHighlight({ rect: null, session: 0 }, rect(0))
    expect(first.session).toBe(1)
    const moved = nextHighlight(first, rect(32))
    expect(moved.session).toBe(1)
    expect(moved.rect?.top).toBe(32)
  })

  it("starts a new session after the highlight clears", () => {
    const cleared = nextHighlight({ rect: rect(0), session: 1 }, null)
    expect(cleared.session).toBe(1)
    expect(nextHighlight(cleared, rect(64)).session).toBe(2)
  })

  it("returns the same state when nothing changed", () => {
    const state = { rect: rect(0), session: 1 }
    expect(nextHighlight(state, rect(0))).toBe(state)
  })
})

describe("aimsAt", () => {
  const submenu = { left: 300, right: 500, top: 100, bottom: 400 }
  const from = { x: 200, y: 120 }

  it("holds while the pointer heads for the submenu", () => {
    expect(aimsAt(from, { x: 220, y: 150 }, submenu)).toBe(true)
  })

  it("lets go when the pointer moves straight down the menu", () => {
    expect(aimsAt(from, { x: 200, y: 150 }, submenu)).toBe(false)
  })

  it("lets go when the pointer drops below the submenu's reach", () => {
    expect(aimsAt(from, { x: 210, y: 200 }, submenu)).toBe(false)
  })

  it("lets go when the pointer moves away from the submenu", () => {
    expect(aimsAt(from, { x: 180, y: 125 }, submenu)).toBe(false)
  })

  it("holds towards a submenu that opened on the left", () => {
    const left = { left: 0, right: 150, top: 100, bottom: 400 }
    expect(aimsAt(from, { x: 180, y: 150 }, left)).toBe(true)
    expect(aimsAt(from, { x: 220, y: 150 }, left)).toBe(false)
  })
})

describe("settleHighlight", () => {
  const destructive = (top: number) =>
    ({ ...rect(top), tone: "destructive" }) satisfies HighlightRect

  it("leaves state alone while the fill glides between rows of one tone", () => {
    const state = { rect: rect(0), session: 1 }
    expect(settleHighlight(state, rect(32), "glide")).toBe(state)
  })

  it("updates the rect when a glide changes the tone", () => {
    const next = settleHighlight(
      { rect: rect(0), session: 1 },
      destructive(32),
      "glide"
    )
    expect(next).toEqual({ rect: destructive(32), session: 1 })
  })

  it("starts a new shape when a resumed panel's kept fill no longer fits", () => {
    const state = { rect: rect(0), session: 1 }
    expect(settleHighlight(state, rect(0), "resume")).toBe(state)
    expect(settleHighlight(state, rect(64), "resume")).toEqual({
      rect: rect(64),
      session: 2
    })
  })

  it("falls back to nextHighlight otherwise", () => {
    const first = settleHighlight({ rect: null, session: 0 }, rect(0), "set")
    expect(first).toEqual({ rect: rect(0), session: 1 })
  })
})
