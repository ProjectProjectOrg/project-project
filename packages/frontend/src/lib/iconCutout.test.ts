import { describe, expect, it } from "vite-plus/test"
import { analyzeCutout, hasAlpha, type RgbaImage } from "./iconCutout"

const solid = (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number]
): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  return { data, width, height }
}

const markOnWhite = solid(64, 64, (x, y) =>
  x > 16 && x < 48 && y > 16 && y < 48
    ? [20, 90, 200, 255]
    : [255, 255, 255, 255]
)

describe("hasAlpha", () => {
  it("is true when the image contains transparent pixels", () => {
    const image = solid(8, 8, (x) =>
      x === 0 ? [0, 0, 0, 0] : [10, 10, 10, 255]
    )
    expect(hasAlpha(image)).toBe(true)
  })

  it("is false for a fully opaque image", () => {
    expect(hasAlpha(markOnWhite)).toBe(false)
  })
})

describe("analyzeCutout", () => {
  it("accepts a mark on a flat white background", () => {
    const result = analyzeCutout(markOnWhite, { tolerance: 24 })
    expect(result.clean).toBe(true)
  })

  it("makes the background transparent and keeps the subject opaque", () => {
    const { alpha } = analyzeCutout(markOnWhite, { tolerance: 24 })
    expect(alpha[0]).toBe(0)
    expect(alpha[32 * 64 + 32]).toBe(255)
  })

  it("rejects a vertical gradient background", () => {
    const gradient = solid(64, 64, (x, y) =>
      x > 16 && x < 48 && y > 16 && y < 48
        ? [20, 90, 200, 255]
        : [255 - y * 3, 255 - y * 2, 255, 255]
    )
    const result = analyzeCutout(gradient, { tolerance: 24 })
    expect(result.clean).toBe(false)
    expect(result.checks.find((c) => c.id === "cornerSpread")?.passed).toBe(
      false
    )
  })

  it("rejects a subject that cannot be separated from its background", () => {
    const matched = solid(64, 64, (x, y) =>
      x > 16 && x < 48 && y > 16 && y < 48
        ? [242, 242, 242, 255]
        : [244, 244, 244, 255]
    )
    expect(analyzeCutout(matched, { tolerance: 24 }).clean).toBe(false)
  })

  it("does not reject a subject merely because it touches the edge", () => {
    const clipped = solid(64, 64, (x, y) =>
      y > 40 && x > 20 && x < 44 ? [20, 90, 200, 255] : [255, 255, 255, 255]
    )
    expect(analyzeCutout(clipped, { tolerance: 24 }).clean).toBe(true)
  })

  it("cuts out a subject that covers a whole corner patch", () => {
    const cornerClipped = solid(64, 64, (x, y) =>
      x > 40 && y > 40 ? [20, 90, 200, 255] : [255, 255, 255, 255]
    )
    const result = analyzeCutout(cornerClipped, { tolerance: 24 })
    expect(result.clean).toBe(true)
    expect(result.alpha[0]).toBe(0)
    expect(result.alpha[56 * 64 + 56]).toBe(255)
  })

  it("rejects a subject whose boundary barely clears the flood tolerance", () => {
    const antialiased = solid(64, 64, (x, y) => {
      if (x > 16 && x < 48 && y > 16 && y < 48) return [225, 225, 225, 255]
      if (x > 15 && x < 49 && y > 15 && y < 49) return [240, 240, 240, 255]
      return [255, 255, 255, 255]
    })
    const result = analyzeCutout(antialiased, { tolerance: 24 })
    expect(result.checks.find((c) => c.id === "edgeContrast")?.passed).toBe(
      false
    )
    expect(result.clean).toBe(false)
  })

  it("rejects images too small for corner sampling without producing NaN", () => {
    const tiny = solid(8, 8, () => [255, 255, 255, 255])
    const result = analyzeCutout(tiny, { tolerance: 24 })
    expect(result.clean).toBe(false)
    expect(result.checks.find((c) => c.id === "minSize")?.passed).toBe(false)
    expect(result.alpha.every((value) => Number.isFinite(value))).toBe(true)
  })
})
