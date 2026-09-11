import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { Slider } from "./slider"

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

describe("Slider endLabels", () => {
  it("captions both ends of the track", () => {
    const { getByText } = render(
      <Slider
        value={40}
        onChange={() => {}}
        min={0}
        max={160}
        label="Background removal"
        endLabels={[
          "Gentle · keeps more background",
          "Aggressive · may eat the subject"
        ]}
      />
    )

    expect(getByText("Gentle · keeps more background")).toBeTruthy()
    expect(getByText("Aggressive · may eat the subject")).toBeTruthy()
  })

  it("captions both ends on the compact engine too", () => {
    const { getByText } = render(
      <Slider
        size="compact"
        value={1}
        onChange={() => {}}
        min={1}
        max={4}
        label="Zoom"
        endLabels={["1× · whole photo", "4× · a quarter of it"]}
      />
    )

    expect(getByText("1× · whole photo")).toBeTruthy()
    expect(getByText("4× · a quarter of it")).toBeTruthy()
  })

  it("renders no caption row when endLabels is omitted", () => {
    const { container } = render(
      <Slider value={1} onChange={() => {}} min={1} max={4} label="Zoom" />
    )

    expect(
      container.querySelector("[data-slot='slider-end-labels']")
    ).toBeNull()
  })
})
