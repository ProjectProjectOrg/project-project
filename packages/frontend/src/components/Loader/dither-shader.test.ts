import { describe, expect, it } from "vitest"
import { DEFAULT_UNIFORMS, FRAGMENT_SRC, VERTEX_SRC } from "./dither-shader"

describe("dither-shader", () => {
  it("exposes both shader stages", () => {
    expect(VERTEX_SRC).toContain("gl_Position")
    expect(FRAGMENT_SRC).toContain("gl_FragColor")
  })

  it("declares the uniforms the mount will set", () => {
    for (const u of [
      "u_image",
      "u_resolution",
      "u_pxSize",
      "u_colorSteps",
      "u_originalColors",
      "u_inverted",
      "u_colorFront",
      "u_colorHighlight",
      "u_colorBack"
    ]) {
      expect(FRAGMENT_SRC).toContain(u)
    }
  })

  it("quantizes with paper's rounding (colorSteps levels + 1)", () => {
    expect(FRAGMENT_SRC).toContain("floor(brightness * colorSteps + 0.5) / colorSteps")
  })

  it("defaults mirror the paper file (originalColors on, transparent back)", () => {
    expect(DEFAULT_UNIFORMS.colorSteps).toBe(2)
    expect(DEFAULT_UNIFORMS.originalColors).toBe(true)
    expect(DEFAULT_UNIFORMS.inverted).toBe(false)
    expect(DEFAULT_UNIFORMS.colorBack[3]).toBe(0)
  })
})
