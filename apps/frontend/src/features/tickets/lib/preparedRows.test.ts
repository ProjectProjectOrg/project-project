import { describe, expect, it } from "vitest"

import { emptyWindow, preparedRows, requiredRows } from "./preparedRows"

describe("prepared ticket rows", () => {
  it("covers a scrollbar jump immediately without mounting the tickets in between", () => {
    expect(
      preparedRows(
        { start: 10, end: 50 },
        { start: 910, end: 930 },
        1000,
        true,
        false
      )
    ).toEqual({ start: 910, end: 930 })
  })

  it("spends each idle batch in the direction of travel first", () => {
    const visible = { start: 100, end: 120 }
    const down = preparedRows(visible, visible, 500, true, true)
    expect(down.start).toBe(visible.start)
    expect(down.end).toBeGreaterThan(visible.end)
    const up = preparedRows(down, visible, 500, false, true)
    expect(up.end).toBe(down.end)
    expect(up.start).toBeLessThan(visible.start)
  })

  it("keeps the viewport covered with a bounded working set through a long scroll and reversal", () => {
    let window = emptyWindow
    const starts = Array.from({ length: 300 }, (_, index) => index * 3)
    for (const forward of [true, false]) {
      for (const start of forward ? starts : starts.toReversed()) {
        const visible = { start, end: start + 20 }
        window = preparedRows(window, visible, 1000, forward, false)
        window = preparedRows(window, visible, 1000, forward, true)
        expect(window.start).toBeLessThanOrEqual(visible.start)
        expect(window.end).toBeGreaterThanOrEqual(visible.end)
        expect(window.end - window.start).toBeLessThan(160)
      }
    }
  })

  it("keeps prepared tickets available for a reversal while the scroll stays inside the window", () => {
    const mounted = { start: 100, end: 200 }
    const down = preparedRows(
      mounted,
      { start: 150, end: 180 },
      500,
      true,
      false
    )
    const up = preparedRows(down, { start: 110, end: 150 }, 500, false, false)
    expect(up).toBe(mounted)
  })

  it("drops prepared tickets beyond a shortened last page", () => {
    expect(
      preparedRows(
        { start: 40, end: 130 },
        { start: 60, end: 70 },
        70,
        true,
        true
      ).end
    ).toBe(70)
  })
})

describe("backlog row layout", () => {
  it("uses the full scroll buffer when leaving either end of a section", () => {
    const viewport = { count: 1000, height: 440, stride: 44 }
    const bottom = viewport.count * viewport.stride - viewport.height
    for (const forward of [true, false]) {
      const interior = requiredRows({
        ...viewport,
        forward,
        phase: "scroll",
        offset: 4400
      })
      const edge = requiredRows({
        ...viewport,
        forward,
        phase: "scroll",
        offset: forward ? 0 : bottom
      })
      expect(edge.end - edge.start).toBe(interior.end - interior.start)
    }
  })

  it("prepares the nearest end of a section as it approaches the viewport", () => {
    const viewport = {
      count: 50,
      height: 160,
      stride: 44,
      forward: true,
      phase: "rest" as const
    }
    const above = requiredRows({ ...viewport, offset: -300 })
    const below = requiredRows({ ...viewport, offset: 2400 })
    expect(above.start).toBe(0)
    expect(above.end).toBeGreaterThan(0)
    expect(below.start).toBeLessThan(viewport.count)
    expect(below.end).toBe(viewport.count)
  })
})
