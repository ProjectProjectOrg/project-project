import { TypeKey } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { toggleChoice } from "./filterChoices"

describe("toggleChoice", () => {
  it("adds a value to the ones already picked", () => {
    expect(
      toggleChoice(
        { type: [TypeKey.make("bug")] },
        { dimension: "type", value: TypeKey.make("feat") }
      )
    ).toEqual({ type: [TypeKey.make("bug"), TypeKey.make("feat")] })
  })

  it("clears a filter when its only value is picked again", () => {
    expect(
      toggleChoice(
        { type: [TypeKey.make("bug")] },
        { dimension: "type", value: TypeKey.make("bug") }
      )
    ).toEqual({ type: undefined })
  })

  it("switches a yes-or-no filter on and off", () => {
    const on = toggleChoice({}, { dimension: "blocked" })
    expect(on).toEqual({ blocked: true })
    expect(toggleChoice(on, { dimension: "blocked" })).toEqual({
      blocked: undefined
    })
  })
})
