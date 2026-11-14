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

  it("keeps the last words of a title whole", () => {
    expect(
      splitForMiddleTruncate(
        "pp CLI sharing one tool catalog with the MCP server"
      )
    ).toEqual({
      head: "pp CLI sharing one tool catalog with",
      tail: " the MCP server"
    })
  })

  it("keeps ten characters when the last word is too long", () => {
    expect(splitForMiddleTruncate("Support for internationalization")).toEqual({
      head: "Support for internatio",
      tail: "nalization"
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
