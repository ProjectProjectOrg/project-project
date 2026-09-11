import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { CropWindow, cropWindowRect, type CropValue } from "./crop-window"

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function nudge(
  value: CropValue,
  key: string,
  options: { shiftKey?: boolean } = {}
) {
  const changes: Array<CropValue> = []
  const { getByRole } = render(
    <CropWindow
      src="/photo.jpg"
      aspect={1}
      shape="squircle"
      label="Crop"
      value={value}
      onChange={(next) => changes.push(next)}
    />
  )

  fireEvent.keyDown(getByRole("group", { name: "Crop" }), { key, ...options })
  cleanup()
  return changes[0]
}

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

describe("CropWindow keyboard", () => {
  const centred: CropValue = { x: 0.5, y: 0.5, zoom: 2 }

  it("moves the window toward the arrow pressed", () => {
    expect(nudge(centred, "ArrowRight")?.x).toBeCloseTo(0.51)
    expect(nudge(centred, "ArrowLeft")?.x).toBeCloseTo(0.49)
    expect(nudge(centred, "ArrowDown")?.y).toBeCloseTo(0.51)
    expect(nudge(centred, "ArrowUp")?.y).toBeCloseTo(0.49)
  })

  it("takes a coarse step when shift is held", () => {
    expect(nudge(centred, "ArrowRight", { shiftKey: true })?.x).toBeCloseTo(0.6)
  })

  it("clamps at the edges instead of running past them", () => {
    expect(nudge({ x: 1, y: 0.5, zoom: 2 }, "ArrowRight")?.x).toBe(1)
    expect(
      nudge({ x: 0, y: 0.5, zoom: 2 }, "ArrowLeft", { shiftKey: true })?.x
    ).toBe(0)
  })

  it("ignores keys it does not handle", () => {
    expect(nudge(centred, "Enter")).toBeUndefined()
  })
})
