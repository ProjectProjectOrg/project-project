import { describe, expect, it } from "vitest"
import { animations, breathingP } from "./animations"

describe("animations", () => {
  it("keeps p within [0,1] across a long time span", () => {
    for (const { name, fn } of animations) {
      for (let t = 0; t <= 12000; t += 37) {
        const { p, shift } = fn(t)
        expect(p, `${name} p at ${t}`).toBeGreaterThanOrEqual(0)
        expect(p, `${name} p at ${t}`).toBeLessThanOrEqual(1)
        expect(shift).toHaveLength(2)
      }
    }
  })

  it("breathing starts folded left and is fully swept at half its period", () => {
    const breathing = animations[0].fn
    expect(breathing(0).p).toBeCloseTo(0, 5)
    expect(breathing(2000).p).toBeCloseTo(1, 5)
  })

  it("sweep moves at constant velocity (linear, not eased)", () => {
    const sweep = animations[1].fn
    expect(sweep(750).p).toBeCloseTo(0.5, 5)
    expect(sweep(1500).p).toBeCloseTo(1, 5)
  })

  it("scan parks the fold at center and only moves the dither", () => {
    const scan = animations[animations.length - 1].fn
    expect(scan(0).p).toBe(0.5)
    expect(scan(5000).p).toBe(0.5)
    expect(scan(900).shift[0]).toBeGreaterThan(0)
  })

  it("still exposes breathingP for the raw svg preview", () => {
    expect(breathingP(0, 4000)).toBeCloseTo(0, 5)
    expect(breathingP(2000, 4000)).toBeCloseTo(1, 5)
  })
})
