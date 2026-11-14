import { describe, expect, it } from "vitest"

import { dissolveBands, pushDissolveLayer } from "./dissolveLayers"

describe("dissolveBands", () => {
  it("gives each layer the cells no newer layer covers", () => {
    const bands = dissolveBands([
      { id: 0, subject: "a", coverage: 1 },
      { id: 1, subject: "b", coverage: 0.5 },
      { id: 2, subject: "c", coverage: 0.25 }
    ])
    expect(
      bands.map(({ subject, from, coverage }) => [subject, from, coverage])
    ).toEqual([
      ["a", 0.5, 1],
      ["b", 0.25, 0.5],
      ["c", 0, 0.25]
    ])
  })

  it("drops layers a newer one fully covers", () => {
    const bands = dissolveBands([
      { id: 0, subject: "a", coverage: 1 },
      { id: 1, subject: "b", coverage: 0.25 },
      { id: 2, subject: "c", coverage: 0.5 }
    ])
    expect(bands.map(({ subject }) => subject)).toEqual(["a", "c"])
  })
})

describe("pushDissolveLayer", () => {
  it("starts from the previous subject when idle", () => {
    expect(pushDissolveLayer([], "a", "b")).toEqual([
      { id: 0, subject: "a", coverage: 1 },
      { id: 1, subject: "b", coverage: 0 }
    ])
  })

  it("freezes the mix in progress when interrupted", () => {
    const layers = pushDissolveLayer(
      [
        { id: 0, subject: "a", coverage: 1 },
        { id: 1, subject: "b", coverage: 0.5 }
      ],
      "b",
      "c"
    )
    expect(layers).toEqual([
      { id: 0, subject: "a", coverage: 1 },
      { id: 1, subject: "b", coverage: 0.5 },
      { id: 2, subject: "c", coverage: 0 }
    ])
  })
})
