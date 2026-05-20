import { describe, expect, it } from "vitest"
import { diffPipTones } from "./ReviewOverview"

describe("diffPipTones", () => {
  it("keeps one deletion pip visible for small deletion counts", () => {
    expect(diffPipTones({ additions: 11, deletions: 1 })).toEqual([
      "addition",
      "addition",
      "addition",
      "addition",
      "addition",
      "deletion"
    ])
  })

  it("keeps one addition pip visible for small addition counts", () => {
    expect(diffPipTones({ additions: 1, deletions: 11 })).toEqual([
      "addition",
      "deletion",
      "deletion",
      "deletion",
      "deletion",
      "deletion"
    ])
  })

  it("uses muted pips when there are no changes", () => {
    expect(diffPipTones({ additions: 0, deletions: 0 })).toEqual([
      "muted",
      "muted",
      "muted",
      "muted",
      "muted",
      "muted"
    ])
  })
})
