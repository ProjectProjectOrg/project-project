import { describe, expect, it } from "vite-plus/test"
import { transitions } from "@/lib/springs"
import {
  bannerCropRect,
  bannerCropStyle,
  bannerCrossfadeTransitions,
  bannerFadeMask
} from "./project-banner-frame"

describe("bannerCropRect", () => {
  it("uses the full width for a 3:1 source at zoom 1, centered", () => {
    const rect = bannerCropRect(3000, 1000, 900, 300, {
      x: 0.5,
      y: 0.5,
      zoom: 1
    })
    expect(rect).toEqual({ x: 0, y: 0, width: 3000, height: 1000 })
  })

  it("shrinks the crop window by zoom and slides it by x/y", () => {
    const rect = bannerCropRect(3000, 1000, 900, 300, {
      x: 1,
      y: 1,
      zoom: 2
    })
    expect(rect.width).toBeCloseTo(1500)
    expect(rect.height).toBeCloseTo(500)
    expect(rect.x).toBeCloseTo((3000 - 1500) * 1)
    expect(rect.y).toBeCloseTo((1000 - 500) * 1)
  })

  it("nests a narrower container's window inside the zoomed crop", () => {
    const rect = bannerCropRect(3000, 1000, 300, 300, {
      x: 0.5,
      y: 0.5,
      zoom: 1
    })
    expect(rect.width).toBeCloseTo(rect.height)
    expect(rect.width).toBeCloseTo(1000)
  })
})

describe("bannerCropStyle", () => {
  it("returns undefined until natural and container sizes are both known", () => {
    expect(
      bannerCropStyle(0, 0, 900, 300, { x: 0.5, y: 0.5, zoom: 1 })
    ).toBeUndefined()
    expect(
      bannerCropStyle(3000, 1000, 0, 0, { x: 0.5, y: 0.5, zoom: 1 })
    ).toBeUndefined()
  })

  it("positions the image so the cropped rect exactly fills the container", () => {
    const style = bannerCropStyle(3000, 1000, 900, 300, {
      x: 0.5,
      y: 0.5,
      zoom: 1
    })
    expect(style).toEqual({
      position: "absolute",
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
      maxWidth: "none"
    })
  })

  it("offsets and enlarges the image for a shifted, zoomed crop", () => {
    const style = bannerCropStyle(3000, 1000, 900, 300, {
      x: 1,
      y: 1,
      zoom: 2
    })
    expect(style?.width).toBe(`${(3000 / 1500) * 100}%`)
    expect(style?.height).toBe(`${(1000 / 500) * 100}%`)
    expect(style?.left).toBe(`${(-1500 / 1500) * 100}%`)
    expect(style?.top).toBe(`${(-500 / 500) * 100}%`)
  })
})

describe("bannerFadeMask", () => {
  it("returns no mask when fade depth is zero", () => {
    expect(bannerFadeMask(0)).toBe("none")
  })

  it("is fully opaque at the top and fully transparent at the bottom for full fade depth", () => {
    const mask = bannerFadeMask(1)
    expect(mask.startsWith("linear-gradient(to bottom, ")).toBe(true)
    expect(mask).toContain("rgba(0,0,0,1) 0%")
    expect(mask).toContain("rgba(0,0,0,0.000) 100.00%")
  })

  it("follows the smoothstep curve, not a linear one, at the midpoint", () => {
    const mask = bannerFadeMask(1)
    expect(mask).toContain("rgba(0,0,0,0.500) 50.00%")
  })

  it("keeps the flat opaque region before the fade starts, scaled by fade depth", () => {
    const mask = bannerFadeMask(0.8)
    expect(mask).toContain("rgba(0,0,0,1) 20.00%")
  })
})

describe("bannerCrossfadeTransitions", () => {
  it("holds the placeholder opaque while it unblurs, then dissolves over the tail", () => {
    const { unblur, dissolve } = bannerCrossfadeTransitions(false)
    expect(unblur).toEqual(transitions.morph)
    expect(dissolve.duration).toBe(transitions.fade.duration)
    expect(dissolve.delay).toBe(
      transitions.morph.duration - transitions.fade.duration
    )
    expect((dissolve.delay ?? 0) + (dissolve.duration ?? 0)).toBeCloseTo(
      transitions.morph.duration
    )
  })

  it("never delays past the start of the unblur", () => {
    const { dissolve } = bannerCrossfadeTransitions(false)
    expect(dissolve.delay ?? 0).toBeGreaterThanOrEqual(0)
  })

  it("skips all animation when reduced motion is preferred", () => {
    const { unblur, dissolve } = bannerCrossfadeTransitions(true)
    expect(unblur).toEqual({ duration: 0 })
    expect(dissolve).toEqual({ duration: 0, delay: 0 })
  })
})
