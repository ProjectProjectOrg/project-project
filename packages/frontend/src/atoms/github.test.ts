import { describe, expect, it } from "vitest"
import { branchesKey } from "./github"

describe("branchesKey", () => {
  it("separates branch caches by connected repo", () => {
    expect(branchesKey("org", "project", "repo-a", "main")).not.toBe(
      branchesKey("org", "project", "repo-b", "main")
    )
  })

  it("is stable for the same project, repo, and query", () => {
    expect(branchesKey("org", "project", "repo-a", "main")).toBe(
      branchesKey("org", "project", "repo-a", "main")
    )
  })
})
