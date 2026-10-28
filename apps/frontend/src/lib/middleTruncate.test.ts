import { describe, expect, it } from "vitest"

import { splitForMiddleTruncate } from "./middleTruncate"

describe("splitForMiddleTruncate", () => {
  it("keeps a short last path segment whole", () => {
    expect(splitForMiddleTruncate("hotfix/2.0.1-crash")).toEqual({
      head: "hotfix/",
      tail: "2.0.1-crash"
    })
  })

  it("keeps ten characters of a long last segment", () => {
    expect(splitForMiddleTruncate("hotfix/2.0.1-crash-on-start")).toEqual({
      head: "hotfix/2.0.1-cras",
      tail: "h-on-start"
    })
  })

  it("leaves short values whole", () => {
    expect(splitForMiddleTruncate("main")).toBeNull()
  })

  it("does not cut inside an emoji", () => {
    expect(
      splitForMiddleTruncate("feature-branch-🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀")?.tail
    ).toBe("🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀")
  })
})
