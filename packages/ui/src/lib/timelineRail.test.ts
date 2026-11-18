import { describe, expect, it } from "vitest"

import { railBend, railPath } from "./timelineRail"

const numbers = (d: string) =>
  [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({
    x: Number(x),
    y: Number(y)
  }))

describe("railPath", () => {
  it("runs straight down a single column", () => {
    expect(
      railPath([
        { x: 10, y: 10 },
        { x: 10, y: 46 },
        { x: 10, y: 82 }
      ])
    ).toBe("M 10 10 L 10 46 L 10 82")
  })

  it("bends into an indent just above the indented mark", () => {
    const points = numbers(
      railPath([
        { x: 10, y: 10 },
        { x: 32, y: 100 }
      ])
    )
    const into = points.findIndex((p) => p.x > 10.01)
    const landed = points.findIndex((p) => Math.abs(p.x - 32) < 0.01)
    expect(points[into - 1]?.y).toBeCloseTo(100 - 10 - 16)
    expect(points[landed]?.y).toBeCloseTo(100 - 10)
  })

  it("bends out of an indent just below the last indented mark", () => {
    const points = numbers(
      railPath([
        { x: 32, y: 10 },
        { x: 10, y: 100 }
      ])
    )
    const leaving = points.findIndex((p) => p.x < 31.99)
    expect(points[leaving - 1]?.y).toBeCloseTo(10 + 10)
  })
})

describe("railBend", () => {
  it("never passes the target column when the indent is small", () => {
    const xs = railBend(10, 16, 0).map((p) => p.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(16 + 1e-9)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10 - 1e-9)
  })
})
