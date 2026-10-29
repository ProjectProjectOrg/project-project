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

  it("shows lists of plain values, and says when one is empty", () => {
    const text = human({ id: "T-1", tags: ["bug", "ui"], assignees: [] })
    expect(text).toMatch(/tags:\s+bug, ui/)
    expect(text).toMatch(/assignees:\s+none/)
  })
})
