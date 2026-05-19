import { describe, expect, it } from "vitest"
import { nextMarkdownChange } from "./LexicalEditor"

describe("nextMarkdownChange", () => {
  it("records the first content edit after initialization", () => {
    expect(nextMarkdownChange("", "pasted text")).toBe("pasted text")
  })

  it("ignores updates that serialize to the loaded markdown", () => {
    expect(nextMarkdownChange("unchanged", "unchanged")).toBeNull()
  })
})
