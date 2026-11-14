import { describe, expect, it } from "vitest"

import { nextHighlight, type HighlightRect } from "./menu-highlight"

const rect = (top: number): HighlightRect => ({
  top,
  left: 4,
  width: 200,
  height: 32,
  tone: "default"
})

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
