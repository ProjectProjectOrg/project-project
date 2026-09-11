import { describe, expect, it } from "vite-plus/test"
import { coverCropStyle } from "./coverCrop"

const pct = (value: string | number | undefined) =>
  Number(String(value).replace("%", ""))

describe("coverCropStyle", () => {
  it("fills the container exactly when aspects match at zoom 1", () => {
    const style = coverCropStyle(1, 1, { x: 0.5, y: 0.5, zoom: 1 })

    expect(pct(style.width)).toBeCloseTo(100)
    expect(pct(style.height)).toBeCloseTo(100)
    expect(pct(style.left)).toBeCloseTo(0)
    expect(pct(style.top)).toBeCloseTo(0)
  })

  it("overflows horizontally for a wide source in a square container", () => {
    const style = coverCropStyle(2, 1, { x: 0.5, y: 0.5, zoom: 1 })

    expect(pct(style.width)).toBeCloseTo(200)
    expect(pct(style.height)).toBeCloseTo(100)
    expect(pct(style.left)).toBeCloseTo(-50)
    expect(pct(style.top)).toBeCloseTo(0)
  })

  it("pans to the source edges as x moves, without changing size", () => {
    const left = coverCropStyle(2, 1, { x: 0, y: 0.5, zoom: 1 })
    const right = coverCropStyle(2, 1, { x: 1, y: 0.5, zoom: 1 })

    expect(pct(left.left)).toBeCloseTo(0)
    expect(pct(right.left)).toBeCloseTo(-100)
    expect(pct(left.width)).toBeCloseTo(pct(right.width))
  })

  it("keeps zoom independent of pan, unlike a centre-origin transform", () => {
    const style = coverCropStyle(1, 1, { x: 0, y: 0, zoom: 2 })

    expect(pct(style.width)).toBeCloseTo(200)
    expect(pct(style.height)).toBeCloseTo(200)
    expect(pct(style.left)).toBeCloseTo(0)
    expect(pct(style.top)).toBeCloseTo(0)
  })

  it("scales a tall source to cover a 3:1 strip", () => {
    const style = coverCropStyle(1, 3, { x: 0.5, y: 0.5, zoom: 1 })

    expect(pct(style.width)).toBeCloseTo(100)
    expect(pct(style.height)).toBeCloseTo(300)
    expect(pct(style.top)).toBeCloseTo(-100)
  })

  it("never distorts: the rendered box keeps the source aspect", () => {
    const containerWidth = 120
    const containerHeight = 40
    const style = coverCropStyle(2, containerWidth / containerHeight, {
      x: 0.3,
      y: 0.7,
      zoom: 1.5
    })

    const renderedWidth = (pct(style.width) / 100) * containerWidth
    const renderedHeight = (pct(style.height) / 100) * containerHeight

    expect(renderedWidth / renderedHeight).toBeCloseTo(2)
  })
})
