import { describe, expect, it } from "vitest"

import { deriveKey } from "./deriveKey"

describe("deriveKey", () => {
  it("takes the initials of a multi-word name", () => {
    expect(deriveKey("Project Project")).toBe("PP")
    expect(deriveKey("l6 temp row")).toBe("LTR")
  })

  it("caps initials at six words", () => {
    expect(deriveKey("a b c d e f g h")).toBe("ABCDEF")
  })

  it("takes up to four letters of a single word", () => {
    expect(deriveKey("Marketing")).toBe("MARK")
    expect(deriveKey("ux")).toBe("UX")
  })

  it("treats punctuation as a word break", () => {
    expect(deriveKey("front-end.app")).toBe("FEA")
  })

  it("drops leading digits", () => {
    expect(deriveKey("2026 roadmap")).toBe("R")
    expect(deriveKey("123")).toBe("")
  })

  it("returns an empty key for a name without letters or digits", () => {
    expect(deriveKey("")).toBe("")
    expect(deriveKey("  !!  ")).toBe("")
  })
})
