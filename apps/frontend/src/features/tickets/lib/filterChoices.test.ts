import { describe, expect, it } from "vitest"

import { toggleChoice } from "./filterChoices"

describe("toggleChoice", () => {
  it("adds a value to the ones already picked", () => {
    expect(
      toggleChoice(
        { rules: [{ field: "type", operator: "is", values: ["bug"] }] },
        { dimension: "type", value: "feat" }
      )
    ).toEqual({
      rules: [{ field: "type", operator: "is", values: ["bug", "feat"] }]
    })
  })

  it("clears a filter when its only value is picked again", () => {
    expect(
      toggleChoice(
        { rules: [{ field: "type", operator: "is", values: ["bug"] }] },
        { dimension: "type", value: "bug" }
      )
    ).toEqual({ rules: [] })
  })

  it("switches a yes-or-no filter on and off", () => {
    const on = toggleChoice({}, { dimension: "blocked" })
    expect(on).toEqual({ rules: [{ field: "blocked", operator: "is" }] })
    expect(toggleChoice(on, { dimension: "blocked" })).toEqual({
      rules: []
    })
  })
})
