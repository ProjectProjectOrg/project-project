import { describe, expect, it } from "vitest"

import { human } from "./format"

describe("human", () => {
  it("shows values nested more than one level deep", () => {
    const text = human({
      states: { "T-12": { branch: "feat/T-12", pr: { number: 5 } } }
    })
    expect(text).toContain("states.T-12.branch:")
    expect(text).toContain("states.T-12.pr.number:")
    expect(text).toContain("5")
  })
})
