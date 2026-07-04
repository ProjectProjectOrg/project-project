import { describe, expect, it } from "vitest"
import { LOGO_GEOMETRY, logoSvgString, panelGeometry } from "./logo-geometry"

const { w, cy, hShort } = LOGO_GEOMETRY

describe("panelGeometry", () => {
  it("places the fold at p*width", () => {
    expect(panelGeometry(0).foldX).toBe(0)
    expect(panelGeometry(0.5).foldX).toBe(w / 2)
    expect(panelGeometry(1).foldX).toBe(w)
  })

  it("clamps p into [0,1]", () => {
    expect(panelGeometry(-1).foldX).toBe(0)
    expect(panelGeometry(2).foldX).toBe(w)
  })

  it("anchors each panel's gradient white at the fold, black at the outer edge", () => {
    const g = panelGeometry(0.5)
    expect(g.leftGradient).toEqual({ x1: w / 2, x2: 0 })
    expect(g.rightGradient).toEqual({ x1: w / 2, x2: w })
  })

  it("is mirror-symmetric about the center", () => {
    const a = panelGeometry(0.3)
    const b = panelGeometry(0.7)
    expect(a.foldX).toBe(w - b.foldX)
    expect(a.leftGradient.x1).toBe(b.rightGradient.x2 - b.rightGradient.x1)
  })

  it("keeps the fold-edge height constant across p (short height at the fold)", () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const g = panelGeometry(p)
      expect(g.leftPath).toContain(`${cy - hShort}`)
      expect(g.rightPath).toContain(`${cy - hShort}`)
    }
  })

  it("emits a standalone svg with both gradients", () => {
    const svg = logoSvgString(0.5)
    expect(svg).toContain("<svg")
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain("linearGradient")
  })
})
