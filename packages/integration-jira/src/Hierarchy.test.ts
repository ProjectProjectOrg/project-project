import type { JiraProjectType } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { resolveJiraHierarchy } from "./Hierarchy"

const issue = (
  id: string,
  issueTypeId: string,
  parentIssueId: string | null
) => ({
  id,
  issueTypeId,
  parentIssueId
})

const mappings = (
  types: Readonly<Record<string, JiraProjectType>>,
  excludedRestrictions: ReadonlyArray<string> = []
) => ({
  issueTypes: Object.entries(types).map(
    ([sourceIssueTypeId, destinationType]) => ({
      sourceIssueTypeId,
      destinationType
    })
  ),
  restrictions: excludedRestrictions.map((restrictionId) => ({
    restrictionId,
    resolution: "exclude" as const
  }))
})

const tree = [
  issue("initiative", "type-initiative", null),
  issue("epic", "type-epic", "initiative"),
  issue("story", "type-story", "epic"),
  issue("subtask", "type-subtask", "story")
]

describe("resolveJiraHierarchy", () => {
  it("keeps epic, issue and subtask as epic, ticket and sub-ticket", () => {
    const { parents, dropped } = resolveJiraHierarchy(
      { issues: tree, restrictions: [] },
      mappings({
        "type-initiative": "other",
        "type-epic": "epic",
        "type-story": "feat",
        "type-subtask": "chore"
      })
    )
    expect([...parents]).toEqual([
      ["story", "epic"],
      ["subtask", "story"]
    ])
    expect(dropped).toEqual([
      {
        issueId: "epic",
        parentIssueId: "initiative",
        parentIssueKey: null,
        reason: "epic-cannot-have-parent"
      }
    ])
  })

  it("drops the deepest link when a Jira epic is not mapped to an epic", () => {
    const { parents, dropped } = resolveJiraHierarchy(
      { issues: tree.slice(1), restrictions: [] },
      mappings({
        "type-epic": "feat",
        "type-story": "feat",
        "type-subtask": "chore"
      })
    )
    expect([...parents]).toEqual([["story", "epic"]])
    expect(dropped).toEqual([
      {
        issueId: "epic",
        parentIssueId: "initiative",
        parentIssueKey: null,
        reason: "parent-not-scanned"
      },
      {
        issueId: "subtask",
        parentIssueId: "story",
        parentIssueKey: null,
        reason: "too-deeply-nested"
      }
    ])
  })

  it("drops a parent that is excluded from the import", () => {
    const { parents, dropped } = resolveJiraHierarchy(
      {
        issues: tree,
        restrictions: [{ id: "r-1", targetKind: "issue", targetId: "story" }]
      },
      mappings(
        { "type-epic": "epic", "type-story": "feat", "type-subtask": "chore" },
        ["r-1"]
      )
    )
    expect(parents.has("subtask")).toBe(false)
    expect(dropped).toContainEqual({
      issueId: "subtask",
      parentIssueId: "story",
      parentIssueKey: null,
      reason: "parent-excluded"
    })
  })
})
