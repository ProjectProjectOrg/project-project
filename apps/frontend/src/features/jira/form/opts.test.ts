import type { JiraMigrationRequirements } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  buildJiraMigrationDraft,
  toPartialJiraMigrationConfiguration
} from "./opts"

const requirements: JiraMigrationRequirements = {
  destination: {
    suggestedName: "Engineering",
    suggestedSlug:
      "engineering" as JiraMigrationRequirements["destination"]["suggestedSlug"],
    suggestedKey:
      "ENG" as JiraMigrationRequirements["destination"]["suggestedKey"]
  },
  identities: [
    {
      jiraAccountId: "jira-user-1",
      displayName: "Ada",
      email: "ada@example.com",
      suggestedProjectProjectUserId: "user-1"
    }
  ],
  identityOptions: [
    {
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      imageUrl: null
    }
  ],
  statuses: [
    {
      jiraStatusId: "status-1",
      name: "Doing",
      categoryKey: "indeterminate",
      suggestedProjectStatusSlug:
        "in_progress" as JiraMigrationRequirements["statuses"][number]["suggestedProjectStatusSlug"],
      createOption: {
        slug: "doing" as NonNullable<
          JiraMigrationRequirements["statuses"][number]["createOption"]
        >["slug"],
        label:
          "Doing" as JiraMigrationRequirements["statusOptions"][number]["label"],
        icon: "CircleDot",
        color: "#6B7280" as NonNullable<
          JiraMigrationRequirements["statuses"][number]["createOption"]
        >["color"],
        isTerminal: false
      }
    }
  ],
  statusOptions: [
    {
      slug: "in_progress" as JiraMigrationRequirements["statusOptions"][number]["slug"],
      label:
        "In progress" as JiraMigrationRequirements["statusOptions"][number]["label"],
      icon: "CircleDot",
      color:
        "#6B7280" as JiraMigrationRequirements["statusOptions"][number]["color"],
      isTerminal: false
    }
  ],
  issueTypes: [
    {
      jiraIssueTypeId: "type-1",
      name: "Story",
      isSubtask: false,
      suggestedProjectType: "feat"
    }
  ],
  priorities: [
    {
      jiraPriorityId: "priority-1",
      name: "Major",
      suggestedProjectPriority: "high"
    }
  ],
  tags: [
    {
      source: { kind: "component", value: "Web" },
      suggestedDestinationTagName:
        "component:web" as JiraMigrationRequirements["tags"][number]["suggestedDestinationTagName"],
      collisionSourceValues: []
    }
  ],
  activeFutureSprintChoices: [
    {
      jiraIssueId: "issue-1",
      issueKey: "ENG-1",
      issueSummary: "Ship it",
      options: [{ jiraSprintId: "sprint-1", name: "Sprint 1", state: "active" }]
    }
  ],
  restrictedContent: { issueCount: 1, commentCount: 0, worklogCount: 0 },
  attachments: [
    {
      jiraAttachmentId: "attachment-1",
      filename: "large.mov",
      byteSize: 30_000_000,
      forcedSkipReason: "too_large"
    }
  ]
}

const excludeRestrictedContent = (
  draft: ReturnType<typeof buildJiraMigrationDraft>
) => ({
  ...draft,
  restrictedContent: { policy: "exclude" as const }
})

describe("Jira migration draft", () => {
  it("leaves restricted content undecided when the scan found restrictions", () => {
    const draft = buildJiraMigrationDraft(requirements, null)

    expect(draft.restrictedContent).toBeUndefined()
    const saved = toPartialJiraMigrationConfiguration(draft)
    expect(saved.restrictedContent).toBeNull()
    expect(
      buildJiraMigrationDraft(requirements, saved).restrictedContent
    ).toBeUndefined()
  })

  it("excludes restricted content automatically when the scan found none", () => {
    const draft = buildJiraMigrationDraft(
      {
        ...requirements,
        restrictedContent: {
          issueCount: 0,
          commentCount: 0,
          worklogCount: 0
        }
      },
      null
    )

    expect(draft.restrictedContent).toEqual({ policy: "exclude" })
  })

  it("does not silently accept mapping suggestions", () => {
    const draft = buildJiraMigrationDraft(requirements, null)

    expect(draft.identities[0]?.projectProjectUserId).toBeUndefined()
    expect(draft.statuses[0]?.projectStatusSlug).toBeUndefined()
    expect(draft.activeFutureSprintChoices[0]?.jiraSprintId).toBeUndefined()
  })

  it("prefills only issue types whose name matches a native type", () => {
    const named = (name: string) =>
      buildJiraMigrationDraft(
        {
          ...requirements,
          issueTypes: [
            {
              jiraIssueTypeId: "type-1",
              name,
              isSubtask: false,
              suggestedProjectType: "chore"
            }
          ]
        },
        null
      ).issueTypes[0]?.projectType

    expect(named("Bug")).toBe("bug")
    expect(named("feature")).toBe("feat")
    expect(named("Chore")).toBe("chore")
    expect(named("Story")).toBeUndefined()
    expect(named("Task")).toBeUndefined()
    expect(named("Subtask")).toBeUndefined()
    expect(named("Epic")).toBeUndefined()
  })

  it("prefills every priority from the server suggestion", () => {
    const draft = buildJiraMigrationDraft(requirements, null)

    expect(draft.priorities[0]?.projectPriority).toBe("high")
  })

  it("prefills suggested tag names", () => {
    const draft = excludeRestrictedContent(
      buildJiraMigrationDraft(requirements, null)
    )

    expect(draft.tags[0]?.destinationTagName).toBe("component:web")
    expect(toPartialJiraMigrationConfiguration(draft).tags).toEqual([
      {
        source: { kind: "component", value: "Web" },
        destinationTagName: "component:web"
      }
    ])
  })

  it("lets a saved tag name win over the suggestion", () => {
    const initial = toPartialJiraMigrationConfiguration(
      excludeRestrictedContent(buildJiraMigrationDraft(requirements, null))
    )
    const draft = buildJiraMigrationDraft(requirements, {
      ...initial,
      tags: [
        {
          source: { kind: "component", value: "Web" },
          destinationTagName:
            "frontend" as (typeof initial.tags)[number]["destinationTagName"]
        }
      ]
    })

    expect(draft.tags[0]?.destinationTagName).toBe("frontend")
  })

  it("keeps forced attachment skips while omitting unanswered decisions", () => {
    const draft = excludeRestrictedContent(
      buildJiraMigrationDraft(requirements, null)
    )
    const configuration = toPartialJiraMigrationConfiguration(draft)

    expect(configuration.identities).toEqual([])
    expect(configuration.statuses).toEqual([])
    expect(configuration.skippedAttachmentIds).toEqual(["attachment-1"])
    expect(configuration.attachmentSkipsAccepted).toBe(false)
  })

  it("preserves an explicit create-status decision across draft rebuilding", () => {
    const initial = toPartialJiraMigrationConfiguration(
      excludeRestrictedContent(buildJiraMigrationDraft(requirements, null))
    )
    const configuration = {
      ...initial,
      statuses: [
        {
          jiraStatusId: "status-1",
          projectStatusSlug: requirements.statuses[0]!.createOption!.slug,
          createStatus: true as const
        }
      ]
    }

    const draft = buildJiraMigrationDraft(requirements, configuration)

    expect(draft.statuses[0]).toEqual(configuration.statuses[0])
    expect(toPartialJiraMigrationConfiguration(draft).statuses).toEqual(
      configuration.statuses
    )
  })
})
