import { describe, expect, it } from "vitest"
import { compareCodePoints } from "./orderKey"

describe("compareCodePoints", () => {
  it("orders supplementary characters by their code point", () => {
    expect(compareCodePoints("ｚ", "😀")).toBeLessThan(0)
    expect(compareCodePoints("😀", "ｚ")).toBeGreaterThan(0)
  })

  it("uses prefix order for equal leading code points", () => {
    expect(compareCodePoints("alpha", "alpha\u0000T-1")).toBeLessThan(0)
  })
})
