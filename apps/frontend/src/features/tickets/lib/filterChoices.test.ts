import { TagName } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { isChosen, toggleChoice } from "./filterChoices"

describe("toggleChoice", () => {
  it("replaces a single-value filter with the picked value", () => {
    expect(
      toggleChoice({ type: ["bug"] }, { dimension: "type", value: "feat" })
    ).toEqual({ type: ["feat"] })
  })

  it("clears a filter when its only value is picked again", () => {
    expect(
      toggleChoice({ type: ["bug"] }, { dimension: "type", value: "bug" })
    ).toEqual({ type: undefined })
  })

  it("adds tags to the ones already picked", () => {
    const auth = TagName.make("auth")
    const api = TagName.make("api")
    const filter = { tags: [auth] }
    const patch = toggleChoice(filter, { dimension: "tags", value: api })
    expect(patch).toEqual({ tags: [auth, api] })
    expect(
      isChosen({ ...filter, ...patch }, { dimension: "tags", value: auth })
    ).toBe(true)
  })

  it("switches a yes-or-no filter on and off", () => {
    const on = toggleChoice({}, { dimension: "blocked" })
    expect(on).toEqual({ blocked: true })
    expect(toggleChoice(on, { dimension: "blocked" })).toEqual({
      blocked: undefined
    })
  })
})
