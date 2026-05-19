import { describe, expect, it } from "vitest"
import {
  buildProjectStateBatchQuery,
  projectStatesFromBatchResponses
} from "./projectState"

const pr = (
  branch: string,
  state: "OPEN" | "CLOSED" | "MERGED" = "OPEN",
  checkState: string | null = "SUCCESS"
) => ({
  number: 42,
  title: branch,
  url: `https://github.test/acme/app/pull/${branch}`,
  state,
  isDraft: false,
  headRefName: branch,
  baseRefName: "main",
  headRepository: { id: "repo-1" },
  baseRepository: { id: "repo-1" },
  mergedAt: null,
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: checkState ? { state: checkState } : null
        }
      }
    ]
  }
})

describe("projectState", () => {
  it("builds a branch-state query with stable aliases and variables", () => {
    const batch = buildProjectStateBatchQuery(["feat/T-1", "bug/T-2"])

    expect(batch.variables).toEqual({
      ref0: "refs/heads/feat/T-1",
      headRefName0: "feat/T-1",
      ref1: "refs/heads/bug/T-2",
      headRefName1: "bug/T-2"
    })
    expect(batch.query).toContain("b0: ref(qualifiedName: $ref0)")
    expect(batch.query).toContain("p0: pullRequests(")
    expect(batch.query).toContain("b1: ref(qualifiedName: $ref1)")
    expect(batch.query).toContain("p1: pullRequests(")
    expect(batch.query).toContain("$headRefName1: String!")
  })

  it("maps batched alias responses back to project state", () => {
    const states = projectStatesFromBatchResponses([
      {
        branches: ["feat/T-1"],
        response: {
          repository: {
            defaultBranchRef: { name: "trunk" },
            b0: { name: "feat/T-1" },
            p0: { nodes: [pr("feat/T-1")] }
          }
        }
      },
      {
        branches: ["bug/T-2"],
        response: {
          repository: {
            defaultBranchRef: { name: "trunk" },
            b0: null,
            p0: { nodes: [pr("bug/T-2", "CLOSED", "FAILURE")] }
          }
        }
      }
    ])

    expect(states?.defaultBranch).toBe("trunk")
    expect([...(states?.existingBranches ?? [])]).toEqual(["feat/T-1"])
    expect(states?.prByBranch.get("feat/T-1")?.checks).toBe("passing")
    expect(states?.prByBranch.get("bug/T-2")?.state).toBe("closed")
    expect(states?.prByBranch.get("bug/T-2")?.checks).toBe("failing")
  })

  it("keeps the batch when one branch ref is stale", () => {
    const states = projectStatesFromBatchResponses([
      {
        branches: ["feat/live", "feat/stale"],
        response: {
          repository: {
            defaultBranchRef: { name: "main" },
            b0: { name: "feat/live" },
            p0: { nodes: [pr("feat/live")] },
            b1: null,
            p1: null
          }
        }
      }
    ])

    expect(states).not.toBeNull()
    expect([...(states?.existingBranches ?? [])]).toEqual(["feat/live"])
    expect(states?.prByBranch.has("feat/live")).toBe(true)
    expect(states?.prByBranch.has("feat/stale")).toBe(false)
  })
})
