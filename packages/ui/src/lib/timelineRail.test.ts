// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { railBend, railPath, railPoints } from "./timelineRail"

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

const box = (top: number, height: number, scrollHeight = height) => {
  const element = document.createElement("div")
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: top, width: 20, height })
  Object.defineProperty(element, "scrollHeight", { get: () => scrollHeight })
  return element
}

describe("railPoints", () => {
  it("follows the most closed clip when clips nest", () => {
    const root = box(0, 200)
    const before = box(0, 20)
    before.dataset.railNode = ""
    const closing = box(40, 29, 58)
    closing.dataset.railClip = ""
    const opened = box(40, 58)
    opened.dataset.railClip = ""
    const mark = box(80, 20)
    mark.dataset.railNode = ""
    opened.append(mark)
    closing.append(opened)
    root.append(before, closing)

    expect(railPoints(root)[1]?.y).toBeCloseTo(10 + (90 - 10) / 2)
  })

  it("puts a closed clip's mark on the mark before it, across too", () => {
    const root = box(0, 200)
    const before = box(0, 20)
    before.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 22, y: 0, width: 20, height: 20 })
    before.dataset.railNode = ""
    const closed = box(40, 0, 58)
    closed.dataset.railClip = ""
    const mark = box(50, 20)
    mark.dataset.railNode = ""
    closed.append(mark)
    root.append(before, closed)

    expect(railPoints(root)[1]).toEqual({ x: 32, y: 10 })
  })

  it("keeps a fold's marks in one column while it opens", () => {
    const root = box(0, 300)
    const before = box(0, 20)
    before.dataset.railNode = ""
    const fold = box(40, 60, 120)
    fold.dataset.railClip = ""
    for (const top of [40, 80, 120]) {
      const mark = box(top, 20)
      mark.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: 22, y: top, width: 20, height: 20 })
      mark.dataset.railNode = ""
      fold.append(mark)
    }
    root.append(before, fold)

    const xs = railPoints(root)
      .slice(1)
      .map((point) => point.x)
    expect(new Set(xs)).toEqual(new Set([21]))
  })

  it("puts a closed mark with nothing before it on the mark after it", () => {
    const root = box(0, 200)
    const closed = box(0, 0, 58)
    closed.dataset.railClip = ""
    const mark = box(20, 20)
    mark.dataset.railNode = ""
    closed.append(mark)
    const after = box(40, 20)
    after.dataset.railNode = ""
    root.append(closed, after)

    expect(railPoints(root)[0]).toEqual({ x: 10, y: 50 })
  })

  it("keeps a leading fold's marks in one column while it opens", () => {
    const root = box(0, 300)
    const fold = box(0, 60, 120)
    fold.dataset.railClip = ""
    for (const top of [0, 40]) {
      const mark = box(top, 20)
      mark.getBoundingClientRect = () =>
        DOMRect.fromRect({ x: 22, y: top, width: 20, height: 20 })
      mark.dataset.railNode = ""
      fold.append(mark)
    }
    const after = box(120, 20)
    after.dataset.railNode = ""
    root.append(fold, after)

    const xs = railPoints(root)
      .slice(0, 2)
      .map((point) => point.x)
    expect(new Set(xs)).toEqual(new Set([21]))
  })
})
