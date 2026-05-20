import { describe, expect, it } from "vitest"
import { branchesKey, shouldInvalidateTicketsForGitStates } from "./github"

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

describe("shouldInvalidateTicketsForGitStates", () => {
  it("ignores git-state responses without ticket transitions", () => {
    expect(shouldInvalidateTicketsForGitStates({ transitioned: [] })).toBe(false)
  })

  it("invalidates when a git-state response transitioned tickets", () => {
    expect(
      shouldInvalidateTicketsForGitStates({
        transitioned: [
          {
            ticketId: "T-1",
            fromStatus: "in_progress",
            toStatus: "done",
            prNumber: 80
          }
        ]
      })
    ).toBe(true)
  })
})
