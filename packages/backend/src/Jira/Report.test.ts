import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import type { JiraMigrationManifest } from "./Manifest"
import { JiraMigrationMappings } from "./Mappings"
import type { JiraPreflightResult } from "./Preflight"
import { createJiraPublicationPlan } from "./PublicationPlan"
import {
  buildJiraMigrationArchive,
  buildJiraMigrationReportMarkdown,
  type JiraMigrationOutcomeInput
} from "./Report"

const convertedText = (markdown: string) => ({
  markdown,
  references: [],
  warnings: [
    { path: ["content", 0], nodeType: "panel", reason: "unsupported" }
  ],
  adf: {}
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
  statuses: [
    { id: "status-1", name: "In Review", categoryKey: "done", raw: {} }
  ],
  issueTypes: [{ id: "type-1", name: "Story", subtask: false, raw: {} }],
  priorities: [{ id: "priority-1", name: "Highest", raw: {} }],
  components: [],
  issues: [
    {
      id: "issue-1",
      key: "APP-1",
      issueNumber: 1,
      summary: "Visible",
      description: convertedText("body"),
      statusId: "status-1",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-linked",
      labels: [],
      componentIds: [],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: ["attachment-1", "attachment-2"],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: {}
    },
    {
      id: "issue-2",
      key: "APP-2",
      issueNumber: 2,
      summary: "Restricted",
      description: null,
      statusId: "status-1",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: null,
      labels: [],
      componentIds: [],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: true,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: { secret: true }
    }
  ],
  comments: [],
  attachments: [
    {
      id: "attachment-1",
      issueId: "issue-1",
      filename: "diagram.png",
      mimeType: "image/png",
      byteSize: 2048,
      downloadUrl: "https://example.atlassian.net/diagram.png",
      jiraUrl: null,
      downloadAllowed: true,
      raw: {}
    },
    {
      id: "attachment-2",
      issueId: "issue-1",
      filename: "recording.mov",
      mimeType: "video/quicktime",
      byteSize: 64 * 1024 * 1024,
      downloadUrl: "https://example.atlassian.net/recording.mov",
      jiraUrl: null,
      downloadAllowed: true,
      raw: {}
    }
  ],
  groups: [],
  restrictions: [
    {
      id: "issue:issue-2",
      targetKind: "issue",
      targetId: "issue-2",
      source: "issue-security",
      raw: {}
    },
    {
      id: "worklog:worklog-1",
      targetKind: "worklog",
      targetId: "worklog-1",
      source: "worklog-visibility",
      raw: {}
    }
  ],
  coverage: [
    {
      category: "issues",
      visibility: "visible-only",
      reason: "jira-permissions"
    }
  ],
  rawPages: [
    { kind: "worklogs", cursor: null, records: [{ id: "worklog-1" }] },
    { kind: "issues", cursor: null, records: [] }
  ]
})

const mappings = () =>
  Schema.decodeSync(JiraMigrationMappings)({
    project: { slug: "application", key: "APP", name: "Application" },
    identities: [
      {
        sourceAccountId: "account-linked",
        resolution: { kind: "link", userId: "user-1" }
      },
      { sourceAccountId: "account-unlinked", resolution: { kind: "unlinked" } }
    ],
    statuses: [{ sourceStatusId: "status-1", destinationStatusSlug: "done" }],
    issueTypes: [{ sourceIssueTypeId: "type-1", destinationType: "feat" }],
    priorities: [
      { sourcePriorityId: "priority-1", destinationPriority: "high" }
    ],
    ticketIds: [
      { sourceIssueId: "issue-1", destinationTicketId: "APP-1" },
      { sourceIssueId: "issue-2", destinationTicketId: "APP-2" }
    ],
    restrictions: [
      { restrictionId: "issue:issue-2", resolution: "exclude" },
      { restrictionId: "worklog:worklog-1", resolution: "exclude" }
    ],
    acknowledgedSkippedAttachmentIds: ["attachment-2"],
    tagCollisions: [],
    openSprintMemberships: []
  })

const preflight: JiraPreflightResult = {
  ready: true,
  blockers: [],
  warnings: [
    {
      code: "source-visibility-limited",
      subjectId: "issues",
      detail: "jira-permissions"
    }
  ],
  attachments: [
    { sourceAttachmentId: "attachment-1", action: "migrate", reason: null },
    { sourceAttachmentId: "attachment-2", action: "skip", reason: "too-large" }
  ]
}

const outcome = (): JiraMigrationOutcomeInput => {
  const source = manifest()
  const decisions = mappings()
  const planned = createJiraPublicationPlan(source, decisions, preflight, {
    "attachment-1": "/api/orgs/acme/attachments/A1"
  })
  if (planned.kind !== "ready") throw new Error("expected a ready plan")
  return {
    migrationId: "migration-1",
    orgSlug: "acme",
    siteName: "Example",
    manifest: source,
    mappings: decisions,
    preflight,
    plan: planned.plan,
    copiedAttachmentIds: ["attachment-1"],
    userLabelsById: { "user-1": "ada" },
    completedAt: "2026-09-16T09:00:00Z"
  }
}

describe("buildJiraMigrationReportMarkdown", () => {
  it("reports what migrated, what changed, and what never left Jira", () => {
    const report = buildJiraMigrationReportMarkdown(outcome())

    expect(report).toContain("# Jira migration report — Application")
    expect(report).toContain("`acme/application`")
    expect(report).toContain("visible to the Jira account")
    expect(report).toContain("| Tickets | 1 |")
    expect(report).toContain("| Attachments copied | 1 |")
    expect(report).toContain("| In Review | `done` | no |")
    expect(report).toContain("| Linked User | ada |")
    expect(report).toContain("| Former User | _not linked_ |")
    expect(report).toContain("| recording.mov | 64.0 MB | too-large |")
    expect(report).toContain("| Issues | 1 | 1 |")
    expect(report).toContain("| Worklogs | 1 | 1 |")
    expect(report).toContain("| `panel` | 1 |")
    expect(report).toContain("| issues | visible-only | jira-permissions |")
    expect(report).toContain("`source-visibility-limited`")
  })

  it("names the excluded restriction policy", () => {
    expect(buildJiraMigrationReportMarkdown(outcome())).toContain(
      "Policy: **excluded and reported**"
    )
  })
})

describe("buildJiraMigrationArchive", () => {
  it("keeps the source records that were migrated and drops excluded ones", () => {
    const archive = buildJiraMigrationArchive(outcome())

    expect(archive.source.issues.map(({ id }) => id)).toEqual(["issue-1"])
    expect(archive.restrictionPolicy).toBe("exclude")
    expect(archive.source.rawPages.map(({ kind }) => kind)).toEqual(["issues"])
    expect(archive.destination).toMatchObject({
      orgSlug: "acme",
      projectSlug: "application"
    })
    expect(archive.outcome.tickets).toEqual([
      {
        sourceIssueKey: "APP-1",
        sourceIssueId: "issue-1",
        ticketId: "APP-1",
        status: "done",
        type: "feat",
        priority: "high"
      }
    ])
    expect(archive.outcome.copiedAttachmentIds).toEqual(["attachment-1"])
  })
})
