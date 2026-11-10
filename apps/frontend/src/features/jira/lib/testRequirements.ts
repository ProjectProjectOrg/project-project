import { JiraMigrationRequirements } from "@pp/shared"
import * as Schema from "effect/Schema"

const decodeRequirements = Schema.decodeSync(JiraMigrationRequirements)

export const testRequirements = decodeRequirements({
  destination: {
    suggestedName: "Engineering",
    suggestedSlug: "engineering",
    suggestedKey: "ENG"
  },
  identities: [
    {
      jiraAccountId: "jira-ada",
      displayName: "Ada",
      email: "ada@example.com",
      suggestedProjectProjectUserId: "user-ada"
    },
    {
      jiraAccountId: "jira-bob",
      displayName: "Bob",
      email: "bob@example.com",
      suggestedProjectProjectUserId: null
    },
    {
      jiraAccountId: "jira-cy",
      displayName: "Cy",
      email: null,
      suggestedProjectProjectUserId: null
    }
  ],
  identityOptions: [
    { id: "user-ada", name: "Ada", email: "ada@example.com", imageUrl: null }
  ],
  statuses: [
    {
      jiraStatusId: "status-doing",
      name: "Doing",
      categoryKey: "indeterminate",
      suggestedProjectStatusSlug: "in_progress",
      createOption: null
    },
    {
      jiraStatusId: "status-done",
      name: "DONE",
      categoryKey: "done",
      suggestedProjectStatusSlug: null,
      createOption: null
    },
    {
      jiraStatusId: "status-qa",
      name: "QA",
      categoryKey: "indeterminate",
      suggestedProjectStatusSlug: null,
      createOption: {
        slug: "qa",
        label: "QA",
        icon: "CircleDot",
        color: "#6B7280",
        isTerminal: false
      }
    }
  ],
  statusOptions: [
    {
      slug: "in_progress",
      label: "In progress",
      icon: "CircleDot",
      color: "#6B7280",
      isTerminal: false
    },
    {
      slug: "done",
      label: "Done",
      icon: "CircleCheck",
      color: "#6B7280",
      isTerminal: true
    }
  ],
  issueTypes: [
    {
      jiraIssueTypeId: "type-story",
      name: "Story",
      isSubtask: false,
      suggestedProjectType: "feat"
    },
    {
      jiraIssueTypeId: "type-bug",
      name: "BUG",
      isSubtask: false,
      suggestedProjectType: null
    },
    {
      jiraIssueTypeId: "type-spike",
      name: "Spike",
      isSubtask: false,
      suggestedProjectType: null
    }
  ],
  priorities: [
    {
      jiraPriorityId: "priority-major",
      name: "Major",
      suggestedProjectPriority: "high"
    }
  ],
  tags: [
    {
      source: { kind: "component", value: "Web" },
      suggestedDestinationTagName: "component:web",
      collisionSourceValues: []
    },
    {
      source: { kind: "label", value: "???" },
      suggestedDestinationTagName: null,
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
})
