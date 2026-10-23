import { describe, expect, it } from "vitest"

import { cropWindowRect } from "./crop-window"

describe("cropWindowRect", () => {
  it("covers the full height of a wide source when the window is square", () => {
    const rect = cropWindowRect({
      sourceWidth: 400,
      sourceHeight: 200,
      aspect: 1,
      zoom: 1,
      x: 0.5,
      y: 0.5
    })

    expect(rect).toEqual({ left: 100, top: 0, width: 200, height: 200 })
  })

  it("covers the full width of a tall source when the window is square", () => {
    const rect = cropWindowRect({
      sourceWidth: 200,
      sourceHeight: 400,
      aspect: 1,
      zoom: 1,
      x: 0.5,
      y: 0.5
    })

    expect(rect).toEqual({ left: 0, top: 100, width: 200, height: 200 })
  })

  it("shrinks the window as zoom rises, keeping the aspect", () => {
    const rect = cropWindowRect({
      sourceWidth: 400,
      sourceHeight: 200,
      aspect: 1,
      zoom: 2,
      x: 0.5,
      y: 0.5
    })

    expect(rect).toEqual({ left: 150, top: 50, width: 100, height: 100 })
  })

  it("slides the window across the slack as x and y move", () => {
    const shared = {
      sourceWidth: 400,
      sourceHeight: 200,
      aspect: 1,
      zoom: 2
    }

    expect(cropWindowRect({ ...shared, x: 0, y: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100
    })
    expect(cropWindowRect({ ...shared, x: 1, y: 1 })).toEqual({
      left: 300,
      top: 100,
      width: 100,
      height: 100
    })
  })

  it("gives a 3:1 window the full width of a 2:1 source", () => {
    const rect = cropWindowRect({
      sourceWidth: 600,
      sourceHeight: 300,
      aspect: 3,
      zoom: 1,
      x: 0.5,
      y: 0.5
    })

    expect(rect).toEqual({ left: 0, top: 50, width: 600, height: 200 })
  })

  it("has no slack at zoom 1 when the source already matches the aspect", () => {
    const rect = cropWindowRect({
      sourceWidth: 300,
      sourceHeight: 100,
      aspect: 3,
      zoom: 1,
      x: 0,
      y: 1
    })

    expect(rect).toEqual({ left: 0, top: 0, width: 300, height: 100 })
  })
})
