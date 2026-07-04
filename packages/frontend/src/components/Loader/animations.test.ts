import { describe, expect, it } from "vitest"
import { animations, breathingP } from "./animations"

describe("animations", () => {
  it("keeps the fold p within [0,1] across a long span", () => {
    for (const { name, fn } of animations) {
      for (let t = 0; t <= 12000; t += 37) {
        const { p } = fn(t, 0.5)
        expect(p, `${name} p at ${t}`).toBeGreaterThanOrEqual(0)
        expect(p, `${name} p at ${t}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it("breathing keeps the perspective static at the passed value", () => {
    const breathing = animations[0].fn
    expect(breathing(0, 0.4).persp).toBe(0.4)
    expect(breathing(1234, 0.4).persp).toBe(0.4)
  })

  it("breathing starts folded left and is fully swept at half its period", () => {
    const breathing = animations[0].fn
    expect(breathing(0, 0.5).p).toBeCloseTo(0, 5)
    expect(breathing(2000, 0.5).p).toBeCloseTo(1, 5)
  })

  it("tilt modulates perspective around the passed base", () => {
    const tilt = animations[1].fn
    const base = 0.5
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t <= 3500; t += 25) {
      const v = tilt(t, base).persp
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(min).toBeLessThan(base)
    expect(max).toBeGreaterThan(base)
  })

  it("shimmer loops seamlessly and keeps both panels visible (no full collapse)", () => {
    const shimmer = animations.find((a) => a.name === "shimmer")!.fn
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t <= 6000; t += 25) {
      const { p } = shimmer(t, 0.5)
      min = Math.min(min, p)
      max = Math.max(max, p)
    }
    expect(min).toBeGreaterThan(0.1)
    expect(max).toBeLessThan(0.9)
    expect(shimmer(6000, 0.5).p).toBeCloseTo(shimmer(0, 0.5).p, 5)
    expect(shimmer(6000, 0.5).persp).toBeCloseTo(shimmer(0, 0.5).persp, 5)
  })

  it("still exposes breathingP for the raw svg preview", () => {
    expect(breathingP(0, 4000)).toBeCloseTo(0, 5)
    expect(breathingP(2000, 4000)).toBeCloseTo(1, 5)
  })
})
