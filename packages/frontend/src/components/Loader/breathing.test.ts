import { describe, expect, it } from "vitest"
import { breathingP } from "./Loader"

describe("breathingP", () => {
  it("starts folded at the left", () => {
    expect(breathingP(0, 4000)).toBeCloseTo(0, 5)
  })
  it("is fully swept at the half period", () => {
    expect(breathingP(2000, 4000)).toBeCloseTo(1, 5)
  })
  it("returns to the start after a full period", () => {
    expect(breathingP(4000, 4000)).toBeCloseTo(0, 5)
  })
  it("eases (slope ~0) at the extremes", () => {
    const near = breathingP(10, 4000)
    expect(near).toBeLessThan(0.001)
  })
})
