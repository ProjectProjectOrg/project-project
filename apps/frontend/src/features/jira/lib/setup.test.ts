import { describe, expect, it } from "vitest"

import { buildJiraImportDraft } from "./draft"
import {
  byImpact,
  rareLabelIndexes,
  filterRowIndexes,
  firstSectionNeedingAttention,
  inviteEveryoneWithEmail,
  jiraSetupCounts,
  keepJiraStatuses,
  leaveRestUnlinked,
  linkAllSuggested,
  moveAllToBacklog,
  visibleSetupSections
} from "./setup"
import { testRequirements as requirements } from "./testRequirements"

const setup = buildJiraImportDraft(requirements, null).setup

describe("jiraSetupCounts", () => {
  it("counts only rows without a valid default as needing attention", () => {
    const counts = jiraSetupCounts(setup, requirements, 0)

    expect(counts.people).toEqual({
      total: 3,
      linked: 1,
      invited: 0,
      unlinked: 2,
      attention: 0
    })
    expect(counts.statuses.attention).toBe(1)
    expect(counts.types.attention).toBe(1)
    expect(counts.tags.attention).toBe(1)
    expect(counts.sprints.attention).toBe(1)
    expect(counts.destination.attention).toBe(0)
    expect(jiraSetupCounts(setup, requirements, 2).destination.attention).toBe(
      2
    )
  })

  it("lands on the first section that needs a decision", () => {
    const counts = jiraSetupCounts(setup, requirements, 0)

    expect(
      firstSectionNeedingAttention(counts, visibleSetupSections(requirements))
    ).toBe("statuses")
  })
})

describe("bulk actions", () => {
  it("links suggestions and invites people with an email", () => {
    const unlinked = setup.identities.map((item) => ({
      ...item,
      projectProjectUserId: null
    }))

    expect(
      linkAllSuggested(unlinked, requirements).map(
        (item) => item.projectProjectUserId
      )
    ).toEqual(["user-ada", null, null])
    expect(
      inviteEveryoneWithEmail(setup.identities, requirements).map(
        (item) => item.inviteEmail
      )
    ).toEqual([undefined, "bob@example.com", undefined])
  })

  it("clears invalid invites when leaving the rest unlinked", () => {
    const pending = [
      { jiraAccountId: "jira-cy", projectProjectUserId: null, inviteEmail: "x" }
    ]

    expect(leaveRestUnlinked(pending)).toEqual([
      { jiraAccountId: "jira-cy", projectProjectUserId: null }
    ])
  })

  it("keeps Jira statuses that have no same-name status", () => {
    const kept = keepJiraStatuses(setup.statuses, requirements)
    expect(kept.slice(0, 2)).toEqual(setup.statuses.slice(0, 2))
    expect(kept[2]).toEqual({
      jiraStatusId: "status-qa",
      projectStatusSlug: "qa",
      createStatus: true
    })
    expect(moveAllToBacklog(setup.activeFutureSprintChoices)).toEqual([
      { jiraIssueId: "issue-1", jiraSprintId: null }
    ])
  })
})

describe("filterRowIndexes", () => {
  it("matches every search word and the attention filter", () => {
    const names = ["Ada Lovelace", "Bob Marley", "Ada Byron"]

    expect(
      filterRowIndexes(
        3,
        { query: "ada by", attentionOnly: false },
        (index) => [names[index]],
        () => true
      )
    ).toEqual([2])
    expect(
      filterRowIndexes(
        3,
        { query: "", attentionOnly: true },
        (index) => [names[index]],
        (index) => index === 1
      )
    ).toEqual([1])
  })
})

describe("tag skipping and ordering", () => {
  it("offers to skip labels used on at most one ticket", () => {
    const counted = {
      ...requirements,
      tags: requirements.tags.map((tag, index) => ({
        ...tag,
        issueCount: index === 0 ? 12 : 1
      }))
    }

    expect(rareLabelIndexes(setup.tags, counted)).toEqual([1])
    expect(jiraSetupCounts(setup, requirements, 0).tags.attention).toBe(1)
    expect(
      jiraSetupCounts(
        {
          ...setup,
          tags: setup.tags.map((tag) => ({ ...tag, skipped: true as const }))
        },
        requirements,
        0
      ).tags
    ).toMatchObject({ skipped: 2, attention: 0 })
  })

  it("puts the rows with the most tickets first", () => {
    const counts = [3, undefined, 40]

    expect(byImpact([0, 1, 2], (index) => counts[index])).toEqual([2, 0, 1])
  })
})
