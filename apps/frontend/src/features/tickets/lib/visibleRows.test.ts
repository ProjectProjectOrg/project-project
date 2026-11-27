import { describe, expect, it } from "vitest"

import { noRows, visibleRows } from "./visibleRows"

const rows = (top: number, count = 1000) =>
  visibleRows({ top, height: 440, overscan: 440, stride: 44, count })

describe("visible ticket rows", () => {
  it("covers the viewport and a viewport either side, in batches of eight", () => {
    expect(rows(4180)).toEqual({ start: 80, end: 120 })
  })

  it("keeps the range while a scroll stays inside the same batches", () => {
    expect(rows(4180 + 44)).toEqual(rows(4180))
  })

  it("mounts nothing for a list far above or below the viewport", () => {
    expect(rows(-5000)).toBe(noRows)
    expect(rows(50_000)).toBe(noRows)
  })

  it("stops at the last loaded row", () => {
    expect(rows(4180, 100)).toEqual({ start: 80, end: 100 })
  })
})
