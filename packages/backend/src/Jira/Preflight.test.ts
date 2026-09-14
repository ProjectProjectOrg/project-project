import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import type { JiraMigrationManifest } from "./Manifest"
import { JiraMigrationMappings } from "./Mappings"
import { preflightJiraMigration } from "./Preflight"

const makeIssue = (id: string, key: string, issueNumber: number) => ({
  id,
  key,
  issueNumber,
  summary: key,
  description: null,
  statusId: "status-1",
  issueTypeId: "type-1",
  priorityId: "priority-1",
  assigneeAccountId: "account-1",
  labels: ["Café API", "Cafe/API"],
  componentIds: [],
  groupIds: ["sprint-active", "sprint-future"],
  parentIssueId: null,
  attachmentIds: [],
  restricted: true,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  raw: {}
})

const makeManifest = (): JiraMigrationManifest => ({
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
      accountId: "account-1",
      displayName: "Jira User",
      emailAddress: null,
      active: true,
      accountType: "atlassian",
      raw: {}
    }
  ],
  statuses: [
    {
      id: "status-1",
      name: "In progress",
      categoryKey: "indeterminate",
      raw: {}
    }
  ],
  issueTypes: [{ id: "type-1", name: "Sub-task", subtask: true, raw: {} }],
  priorities: [{ id: "priority-1", name: "High", raw: {} }],
  components: [],
  issues: [makeIssue("issue-1", "APP-1", 1)],
  comments: [],
  attachments: [
    {
      id: "attachment-ok",
      issueId: "issue-1",
      filename: "ok.png",
      mimeType: "image/png",
      byteSize: 25 * 1024 * 1024,
      downloadUrl: "https://example.atlassian.net/ok.png",
      jiraUrl: "https://example.atlassian.net/browse/APP-1",
      downloadAllowed: true,
      raw: {}
    },
    {
      id: "attachment-large",
      issueId: "issue-1",
      filename: "large.png",
      mimeType: "image/png",
      byteSize: 25 * 1024 * 1024 + 1,
      downloadUrl: "https://example.atlassian.net/large.png",
      jiraUrl: null,
      downloadAllowed: true,
      raw: {}
    },
    {
      id: "attachment-type",
      issueId: "issue-1",
      filename: "notes.txt",
      mimeType: "text/plain",
      byteSize: 20,
      downloadUrl: "https://example.atlassian.net/notes.txt",
      jiraUrl: null,
      downloadAllowed: true,
      raw: {}
    },
    {
      id: "attachment-forbidden",
      issueId: "issue-1",
      filename: "hidden.pdf",
      mimeType: "application/pdf",
      byteSize: 20,
      downloadUrl: null,
      jiraUrl: null,
      downloadAllowed: false,
      raw: {}
    }
  ],
  groups: [
    {
      id: "sprint-done",
      kind: "sprint",
      name: "Completed",
      description: null,
      state: "completed",
      issueIds: ["issue-1"],
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
      issueIds: ["issue-1"],
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
      issueIds: ["issue-1"],
      startsAt: null,
      endsAt: null,
      completedAt: null,
      raw: {}
    }
  ],
  restrictions: [
    {
      id: "restriction-1",
      targetKind: "issue",
      targetId: "issue-1",
      source: "security-level",
      raw: {}
    }
  ],
  coverage: [
    {
      category: "issues",
      visibility: "visible-only",
      reason: "connected-account permissions"
    }
  ],
  rawPages: []
})

const environment = {
  existingProjectSlugs: [] as ReadonlyArray<string>,
  existingProjectKeys: [] as ReadonlyArray<string>,
  existingTicketIds: [] as ReadonlyArray<string>,
  existingUserIds: ["user-1"] as ReadonlyArray<string>,
  existingStatusSlugs: ["in_progress"] as ReadonlyArray<string>
}

const decodeMappings = Schema.decodeSync(JiraMigrationMappings)

describe("preflightJiraMigration", () => {
  it("blocks every unresolved explicit decision and classifies attachment skips", () => {
    const mappings = decodeMappings({
      project: { slug: "application", key: "APP", name: "Application" },
      identities: [],
      statuses: [],
      issueTypes: [],
      priorities: [],
      ticketIds: [],
      restrictions: [],
      acknowledgedSkippedAttachmentIds: [],
      tagCollisions: [],
      openSprintMemberships: []
    })

    const result = preflightJiraMigration(makeManifest(), mappings, environment)

    expect(result.ready).toBe(false)
    expect(result.blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "missing-identity-decision",
        "missing-status-mapping",
        "missing-type-mapping",
        "missing-priority-mapping",
        "missing-ticket-id-mapping",
        "missing-restriction-decision",
        "missing-tag-collision-decision",
        "missing-open-sprint-decision",
        "unacknowledged-attachment-skip"
      ])
    )
    expect(result.attachments).toEqual([
      {
        sourceAttachmentId: "attachment-forbidden",
        action: "skip",
        reason: "unavailable"
      },
      {
        sourceAttachmentId: "attachment-large",
        action: "skip",
        reason: "too-large"
      },
      { sourceAttachmentId: "attachment-ok", action: "migrate", reason: null },
      {
        sourceAttachmentId: "attachment-type",
        action: "skip",
        reason: "unsupported-mime"
      }
    ])
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["source-visibility-limited", "subtask-flattened"])
    )
  })

  it("is ready after valid explicit decisions including skipping all competing open sprints", () => {
    const mappings = decodeMappings({
      project: { slug: "application", key: "APP", name: "Application" },
      identities: [
        {
          sourceAccountId: "account-1",
          resolution: { kind: "link", userId: "user-1" }
        }
      ],
      statuses: [
        {
          sourceStatusId: "status-1",
          destinationStatusSlug: "in_progress"
        }
      ],
      issueTypes: [{ sourceIssueTypeId: "type-1", destinationType: "other" }],
      priorities: [
        { sourcePriorityId: "priority-1", destinationPriority: "high" }
      ],
      ticketIds: [{ sourceIssueId: "issue-1", destinationTicketId: "APP-1" }],
      restrictions: [{ restrictionId: "restriction-1", resolution: "exclude" }],
      acknowledgedSkippedAttachmentIds: [
        "attachment-large",
        "attachment-type",
        "attachment-forbidden"
      ],
      tagCollisions: [
        {
          destinationTag: "cafe-api",
          sourceIds: ["label:Cafe/API", "label:Café API"],
          resolution: "merge"
        }
      ],
      openSprintMemberships: [
        { sourceIssueId: "issue-1", selectedGroupId: null }
      ]
    })

    const result = preflightJiraMigration(makeManifest(), mappings, environment)

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it("blocks ticket IDs that collide with each other or existing destination data", () => {
    const manifest: JiraMigrationManifest = {
      ...makeManifest(),
      issues: [
        makeIssue("issue-1", "APP-1", 1),
        makeIssue("issue-2", "APP-2", 2)
      ]
    }
    const mappings = decodeMappings({
      project: { slug: "application", key: "APP", name: "Application" },
      identities: [
        { sourceAccountId: "account-1", resolution: { kind: "unlinked" } }
      ],
      statuses: [
        { sourceStatusId: "status-1", destinationStatusSlug: "in_progress" }
      ],
      issueTypes: [{ sourceIssueTypeId: "type-1", destinationType: "other" }],
      priorities: [
        { sourcePriorityId: "priority-1", destinationPriority: "high" }
      ],
      ticketIds: [
        { sourceIssueId: "issue-1", destinationTicketId: "APP-7" },
        { sourceIssueId: "issue-2", destinationTicketId: "APP-7" }
      ],
      restrictions: [{ restrictionId: "restriction-1", resolution: "exclude" }],
      acknowledgedSkippedAttachmentIds: [
        "attachment-large",
        "attachment-type",
        "attachment-forbidden"
      ],
      tagCollisions: [
        {
          destinationTag: "cafe-api",
          sourceIds: ["label:Cafe/API", "label:Café API"],
          resolution: "merge"
        }
      ],
      openSprintMemberships: [
        { sourceIssueId: "issue-1", selectedGroupId: null },
        { sourceIssueId: "issue-2", selectedGroupId: null }
      ]
    })

    const result = preflightJiraMigration(manifest, mappings, {
      ...environment,
      existingTicketIds: ["APP-7"]
    })

    expect(result.blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "duplicate-destination-ticket-id",
        "ticket-id-collision"
      ])
    )
  })
})
