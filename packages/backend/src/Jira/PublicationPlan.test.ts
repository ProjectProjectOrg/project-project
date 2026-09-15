import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import type { JiraConvertedText, JiraMigrationManifest } from "./Manifest"
import { JiraMigrationMappings } from "./Mappings"
import type { JiraPreflightResult } from "./Preflight"
import {
  createJiraPublicationPlan,
  createJiraReferenceTargets,
  rewriteJiraPublicationText
} from "./PublicationPlan"

const convertedText = (
  markdown: string,
  references: JiraConvertedText["references"]
): JiraConvertedText => ({ markdown, references, warnings: [], adf: {} })

const makeIssue = (
  id: string,
  key: string,
  issueNumber: number,
  description: JiraConvertedText | null,
  groupIds: ReadonlyArray<string>
) => ({
  id,
  key,
  issueNumber,
  summary: key,
  description,
  statusId: "status-1",
  issueTypeId: "type-1",
  priorityId: "priority-1",
  assigneeAccountId: "account-linked",
  labels: ["Migration"],
  componentIds: ["component-1"],
  groupIds,
  parentIssueId: id === "issue-4" ? "issue-1" : null,
  attachmentIds: id === "issue-1" ? ["attachment-1"] : [],
  restricted: false,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
  raw: {}
})

const manifest = (): JiraMigrationManifest => ({
  version: 1,
  migrationId: "migration-1",
  source: {
    cloudId: "cloud-1",
    siteUrl: "https://example.atlassian.net",
    projectId: "10000",
    projectKey: "APP",
    projectName: "Application",
    productType: "software",
    scannedAt: "2026-09-14T12:00:00Z"
  },
  identities: [
    {
      accountId: "account-linked",
      displayName: "Linked User",
      emailAddress: null,
      active: true,
      accountType: "atlassian",
      raw: {}
    },
    {
      accountId: "account-unlinked",
      displayName: "Former User",
      emailAddress: null,
      active: false,
      accountType: "atlassian",
      raw: {}
    }
  ],
  statuses: [{ id: "status-1", name: "Done", categoryKey: "done", raw: {} }],
  issueTypes: [{ id: "type-1", name: "Sub-task", subtask: true, raw: {} }],
  priorities: [{ id: "priority-1", name: "High", raw: {} }],
  components: [
    { id: "component-1", name: "API", description: "Backend", raw: {} }
  ],
  issues: [
    makeIssue(
      "issue-1",
      "APP-1",
      1,
      convertedText("\uE000i\uE001 and \uE000e\uE001", [
        {
          kind: "jira-issue",
          sourceId: "APP-4",
          placeholder: "\uE000i\uE001",
          originalUrl: "https://example.atlassian.net/browse/APP-4",
          fallbackText: "APP-4"
        },
        {
          kind: "jira-issue",
          sourceId: "EXT-9",
          placeholder: "\uE000e\uE001",
          originalUrl: "https://example.atlassian.net/browse/EXT-9",
          fallbackText: "EXT-9"
        }
      ]),
      ["sprint-done", "sprint-active", "sprint-future"]
    ),
    makeIssue("issue-4", "APP-4", 4, null, [
      "sprint-done",
      "sprint-active",
      "sprint-future"
    ])
  ],
  comments: [
    {
      id: "comment-1",
      issueId: "issue-1",
      authorAccountId: "account-unlinked",
      authorDisplayName: "Former User",
      body: convertedText("Comment", []),
      createdAt: "2026-09-01T11:00:00Z",
      updatedAt: null,
      restricted: false,
      raw: {}
    }
  ],
  attachments: [
    {
      id: "attachment-1",
      issueId: "issue-1",
      filename: "diagram.png",
      mimeType: "image/png",
      byteSize: 100,
      downloadUrl: "https://example.atlassian.net/diagram.png",
      jiraUrl: null,
      downloadAllowed: true,
      raw: {}
    }
  ],
  groups: [
    {
      id: "sprint-done",
      kind: "sprint",
      name: "Done",
      description: null,
      state: "completed",
      issueIds: ["issue-1", "issue-4"],
      startsAt: null,
      endsAt: null,
      completedAt: "2026-08-01T00:00:00Z",
      raw: {}
    },
    {
      id: "sprint-active",
      kind: "sprint",
      name: "Active",
      description: null,
      state: "active",
      issueIds: ["issue-1", "issue-4"],
      startsAt: null,
      endsAt: null,
      completedAt: null,
      raw: {}
    },
    {
      id: "sprint-future",
      kind: "sprint",
      name: "Future",
      description: null,
      state: "future",
      issueIds: ["issue-1", "issue-4"],
      startsAt: null,
      endsAt: null,
      completedAt: null,
      raw: {}
    }
  ],
  restrictions: [],
  coverage: [],
  rawPages: []
})

const mappings = () =>
  Schema.decodeSync(JiraMigrationMappings)({
    project: { slug: "application", key: "APP", name: "Application" },
    identities: [
      {
        sourceAccountId: "account-linked",
        resolution: { kind: "link", userId: "user-1" }
      },
      {
        sourceAccountId: "account-unlinked",
        resolution: { kind: "unlinked" }
      }
    ],
    statuses: [{ sourceStatusId: "status-1", destinationStatusSlug: "done" }],
    issueTypes: [{ sourceIssueTypeId: "type-1", destinationType: "other" }],
    priorities: [
      { sourcePriorityId: "priority-1", destinationPriority: "high" }
    ],
    ticketIds: [
      { sourceIssueId: "issue-1", destinationTicketId: "APP-1" },
      { sourceIssueId: "issue-4", destinationTicketId: "APP-4" }
    ],
    restrictions: [],
    acknowledgedSkippedAttachmentIds: [],
    tagCollisions: [],
    openSprintMemberships: [
      { sourceIssueId: "issue-1", selectedGroupId: "sprint-active" },
      { sourceIssueId: "issue-4", selectedGroupId: null }
    ]
  })

const readyPreflight: JiraPreflightResult = {
  ready: true,
  blockers: [],
  warnings: [],
  attachments: [
    { sourceAttachmentId: "attachment-1", action: "migrate", reason: null }
  ]
}

describe("Jira publication references", () => {
  it("rewrites internal issues and linked users while retaining external Jira links", () => {
    const source = manifest()
    const targets = createJiraReferenceTargets(source, mappings(), {
      "attachment-1": "/api/orgs/acme/attachments/A1"
    })
    const text = convertedText("\uE000i\uE001 \uE000e\uE001 \uE000u\uE001", [
      {
        kind: "jira-issue",
        sourceId: "APP-4",
        placeholder: "\uE000i\uE001",
        originalUrl: "https://example.atlassian.net/browse/APP-4",
        fallbackText: "APP-4"
      },
      {
        kind: "jira-issue",
        sourceId: "EXT-9",
        placeholder: "\uE000e\uE001",
        originalUrl: "https://example.atlassian.net/browse/EXT-9",
        fallbackText: "EXT-9"
      },
      {
        kind: "jira-user",
        sourceId: "account-linked",
        placeholder: "\uE000u\uE001",
        originalUrl: null,
        fallbackText: "@Linked User"
      }
    ])

    expect(rewriteJiraPublicationText(text, targets)).toBe(
      "[APP-4](mention:ticket/APP-4) [EXT-9](https://example.atlassian.net/browse/EXT-9) [@Linked User](mention:user/user-1)"
    )
  })
})

describe("createJiraPublicationPlan", () => {
  it("stages flattened tickets, pending attachments, and all completed sprint history before one atomic exposure", () => {
    const source = manifest()
    const result = createJiraPublicationPlan(
      source,
      mappings(),
      readyPreflight,
      { "attachment-1": "/api/orgs/acme/attachments/A1" }
    )

    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(result.plan.visibility).toBe("hidden")
    expect(result.plan.archivePath).toBe("imports/jira/migration-1")
    expect(result.plan.createdStatuses).toEqual([])
    expect(result.plan.tickets.map(({ id }) => id)).toEqual(["APP-1", "APP-4"])
    expect(result.plan.tickets[1]).not.toHaveProperty("parentIssueId")
    expect(result.plan.tickets[0]?.tags).toEqual(["component:api", "migration"])
    expect(result.plan.comments[0]?.author).toEqual({
      kind: "jira",
      accountId: "account-unlinked",
      displayName: "Former User"
    })
    expect(result.plan.attachments).toEqual([
      {
        sourceAttachmentId: "attachment-1",
        ticketId: "APP-1",
        filename: "diagram.png",
        contentType: "image/png",
        byteSize: 100,
        downloadUrl: "https://example.atlassian.net/diagram.png",
        destinationUrl: "/api/orgs/acme/attachments/A1",
        status: "pending"
      }
    ])
    expect(
      result.plan.groups.find(
        ({ sourceGroupId }) => sourceGroupId === "sprint-done"
      )?.ticketIds
    ).toEqual(["APP-1", "APP-4"])
    expect(
      result.plan.groups.find(
        ({ sourceGroupId }) => sourceGroupId === "sprint-active"
      )?.ticketIds
    ).toEqual(["APP-1"])
    expect(
      result.plan.groups.find(
        ({ sourceGroupId }) => sourceGroupId === "sprint-future"
      )?.ticketIds
    ).toEqual([])
    expect(result.plan.atomicPublication).toEqual({
      exposeProject: true,
      publishIndexes: true,
      markMigrationSucceeded: true
    })
  })

  it("returns blockers instead of a staging plan when preflight is not ready", () => {
    const blocker = {
      code: "missing-status-mapping" as const,
      subjectId: "status-1",
      detail: null
    }
    const result = createJiraPublicationPlan(
      manifest(),
      mappings(),
      { ...readyPreflight, ready: false, blockers: [blocker] },
      {}
    )

    expect(result).toEqual({ kind: "blocked", blockers: [blocker] })
  })

  it("deduplicates identical created status descriptors deterministically", () => {
    const source = manifest()
    const withSharedStatus: JiraMigrationManifest = {
      ...source,
      statuses: [
        {
          id: "status-1",
          name: "QA Review",
          categoryKey: "indeterminate",
          raw: {}
        },
        {
          id: "status-2",
          name: "QA Review",
          categoryKey: "indeterminate",
          raw: {}
        }
      ],
      issues: source.issues.map((issue) =>
        issue.id === "issue-4" ? { ...issue, statusId: "status-2" } : issue
      )
    }
    const withCreatedMappings: JiraMigrationMappings = {
      ...mappings(),
      statuses: [
        {
          sourceStatusId: "status-2",
          destinationStatusSlug: "qa_review" as never,
          createStatus: true
        },
        {
          sourceStatusId: "status-1",
          destinationStatusSlug: "qa_review" as never,
          createStatus: true
        }
      ]
    }

    const result = createJiraPublicationPlan(
      withSharedStatus,
      withCreatedMappings,
      readyPreflight,
      {}
    )

    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(result.plan.createdStatuses).toEqual([
      {
        slug: "qa_review",
        label: "QA Review",
        icon: "CircleDot",
        color: "#3b82f6",
        isTerminal: false
      }
    ])
    expect(result.plan.tickets.map(({ status }) => status)).toEqual([
      "qa_review",
      "qa_review"
    ])
  })

  it("keeps excluded restricted issue metadata out of native staged objects", () => {
    const source = manifest()
    const restrictedSource: JiraMigrationManifest = {
      ...source,
      issues: source.issues.map((issue) => {
        if (issue.id !== "issue-4") return issue
        return Object.assign({}, issue, {
          labels: ["Secret label"],
          restricted: true
        })
      }),
      restrictions: [
        {
          id: "restriction-1",
          targetKind: "issue",
          targetId: "issue-4",
          source: "security-level",
          raw: {}
        }
      ]
    }
    const restrictedMappings = {
      ...mappings(),
      restrictions: [
        { restrictionId: "restriction-1", resolution: "exclude" as const }
      ]
    }

    const result = createJiraPublicationPlan(
      restrictedSource,
      restrictedMappings,
      readyPreflight,
      { "attachment-1": "/api/orgs/acme/attachments/A1" }
    )

    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(result.plan.tickets.map(({ id }) => id)).toEqual(["APP-1"])
    expect(result.plan.tags.map(({ name }) => name)).not.toContain(
      "secret-label"
    )
    expect(
      result.plan.groups.flatMap(({ ticketIds }) => ticketIds)
    ).not.toContain("APP-4")
  })
})
