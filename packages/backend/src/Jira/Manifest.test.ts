import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import {
  JIRA_MIGRATION_MANIFEST_VERSION,
  JiraMigrationManifest,
  JiraMigrationManifestV1,
  JiraMigrationManifestV2,
  normalizeJiraManifest,
  normalizeJiraMigrationManifestV2,
  type JiraMigrationManifestV2 as JiraMigrationManifestV2Type
} from "./Manifest"

const manifest: JiraMigrationManifest = {
  version: 1 as const,
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
      accountId: "account-b",
      displayName: "B",
      emailAddress: null,
      active: false,
      accountType: "atlassian",
      raw: { id: "raw-b" }
    },
    {
      accountId: "account-a",
      displayName: "A",
      emailAddress: "a@example.com",
      active: true,
      accountType: "atlassian",
      raw: { id: "raw-a" }
    }
  ],
  statuses: [
    { id: "2", name: "Done", categoryKey: "done", raw: { id: "2" } },
    { id: "1", name: "To Do", categoryKey: "new", raw: { id: "1" } }
  ],
  issueTypes: [
    { id: "20", name: "Subtask", subtask: true, raw: { id: "20" } },
    { id: "10", name: "Story", subtask: false, raw: { id: "10" } }
  ],
  priorities: [
    { id: "2", name: "Low", raw: { id: "2" } },
    { id: "1", name: "High", raw: { id: "1" } }
  ],
  components: [
    { id: "2", name: "Web", description: null, raw: { id: "2" } },
    { id: "1", name: "API", description: "Backend", raw: { id: "1" } }
  ],
  issues: [
    {
      id: "10003",
      key: "APP-4",
      issueNumber: 4,
      summary: "Fourth",
      description: null,
      statusId: "2",
      issueTypeId: "20",
      priorityId: null,
      assigneeAccountId: null,
      labels: ["zeta", "alpha"],
      componentIds: ["2", "1"],
      groupIds: ["sprint-2", "sprint-1"],
      parentIssueId: "10001",
      attachmentIds: ["attachment-2", "attachment-1"],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: { id: "10003" }
    },
    {
      id: "10001",
      key: "APP-1",
      issueNumber: 1,
      summary: "First",
      description: null,
      statusId: "1",
      issueTypeId: "10",
      priorityId: "1",
      assigneeAccountId: "account-a",
      labels: [],
      componentIds: [],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: false,
      createdAt: "2026-09-01T09:00:00Z",
      updatedAt: "2026-09-02T09:00:00Z",
      raw: { id: "10001" }
    }
  ],
  comments: [],
  attachments: [],
  groups: [],
  restrictions: [],
  coverage: [
    {
      category: "worklogs",
      visibility: "partial",
      reason: "visible to connected account"
    },
    { category: "issues", visibility: "visible-only", reason: null }
  ],
  rawPages: [
    { kind: "issues", cursor: "next", records: [{ id: "2" }] },
    { kind: "issues", cursor: null, records: [{ id: "1" }] }
  ]
}

describe("JiraMigrationManifest", () => {
  it("accepts the current version and rejects another version", () => {
    const decode = Schema.decodeUnknownSync(JiraMigrationManifest)

    expect(decode(manifest).version).toBe(1)
    expect(() => decode({ ...manifest, version: 2 })).toThrow()
  })

  it("keeps version 1 decoding explicit while version 2 is current", () => {
    expect(JIRA_MIGRATION_MANIFEST_VERSION).toBe(2)
    expect(Schema.decodeUnknownSync(JiraMigrationManifestV1)(manifest)).toEqual(
      manifest
    )
    expect(() =>
      Schema.decodeUnknownSync(JiraMigrationManifestV2)(manifest)
    ).toThrow()
  })
})

describe("normalizeJiraManifest", () => {
  it("orders source records deterministically without renumbering issue-key gaps", () => {
    const normalized = normalizeJiraManifest(manifest)

    expect(normalized.identities.map(({ accountId }) => accountId)).toEqual([
      "account-a",
      "account-b"
    ])
    expect(normalized.issues.map(({ key }) => key)).toEqual(["APP-1", "APP-4"])
    expect(normalized.issues[1]?.labels).toEqual(["alpha", "zeta"])
    expect(normalized.issues[1]?.componentIds).toEqual(["1", "2"])
    expect(normalized.issues[1]?.attachmentIds).toEqual([
      "attachment-1",
      "attachment-2"
    ])
    expect(normalized.rawPages.map(({ cursor }) => cursor)).toEqual([
      null,
      "next"
    ])
    expect(manifest.issues[0]?.labels).toEqual(["zeta", "alpha"])
  })
})

const artifact = (key: string) => ({
  key,
  contentType: "application/json",
  byteSize: 2,
  sha256: "a".repeat(64)
})

const manifestV2: JiraMigrationManifestV2Type = {
  version: 2,
  migrationId: "migration-2",
  scanRevision: 4,
  source: {
    cloudId: "cloud-1",
    siteUrl: "https://example.atlassian.net",
    projectId: "10000",
    projectKey: "APP",
    projectName: "Application",
    scannedAt: "2026-09-22T12:00:00Z",
    visibleAccount: {
      accountId: "account-a",
      displayName: "Visible User",
      caveat: "Only content visible to this account was scanned."
    }
  },
  workflow: {
    executionId: "execution-1",
    attempt: 2
  },
  fieldDefinitions: [
    { id: "field-2", key: "priority", name: "Priority", type: "priority" },
    { id: "field-1", key: "summary", name: "Summary", type: "string" }
  ],
  workflows: [
    {
      id: "workflow-1",
      name: "Software workflow",
      statusIds: ["status-2", "status-1"]
    }
  ],
  identities: [
    {
      accountId: "account-b",
      displayName: "B",
      emailAddress: null,
      active: true,
      accountType: "atlassian"
    },
    {
      accountId: "account-a",
      displayName: "A",
      emailAddress: null,
      active: true,
      accountType: "atlassian"
    }
  ],
  statuses: [
    { id: "status-2", name: "Done", categoryKey: "done" },
    { id: "status-1", name: "To Do", categoryKey: "new" }
  ],
  issueTypes: [{ id: "type-1", name: "Task", subtask: false }],
  priorities: [{ id: "priority-1", name: "High" }],
  components: [{ id: "component-1", name: "API", description: null }],
  issues: [
    {
      id: "issue-2",
      key: "APP-2",
      issueNumber: 2,
      summary: "Second",
      descriptionArtifact: artifact("description-2.json"),
      statusId: "status-2",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-b",
      reporterAccountId: "account-a",
      labelIds: ["z", "a"],
      componentIds: ["component-1"],
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z"
    },
    {
      id: "issue-1",
      key: "APP-1",
      issueNumber: 1,
      summary: "First",
      descriptionArtifact: null,
      statusId: "status-1",
      issueTypeId: "type-1",
      priorityId: null,
      assigneeAccountId: null,
      reporterAccountId: null,
      labelIds: [],
      componentIds: [],
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z"
    }
  ],
  comments: [
    {
      id: "comment-1",
      issueId: "issue-1",
      authorAccountId: "account-a",
      bodyArtifact: artifact("comment-1.json"),
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: null,
      restricted: false
    }
  ],
  changelogs: [
    {
      id: "change-1",
      issueId: "issue-1",
      authorAccountId: "account-a",
      createdAt: "2026-09-01T00:00:00Z",
      changes: [{ fieldId: "field-2", from: "priority-2", to: "priority-1" }]
    }
  ],
  worklogs: [
    {
      id: "worklog-1",
      issueId: "issue-1",
      authorAccountId: "account-a",
      seconds: 3600,
      startedAt: "2026-09-01T00:00:00Z",
      bodyArtifact: null,
      restricted: false
    }
  ],
  watchers: [{ id: "watch-1", issueId: "issue-1", accountId: "account-a" }],
  votes: [{ id: "vote-1", issueId: "issue-1", accountId: "account-a" }],
  attachments: [
    {
      id: "attachment-1",
      issueId: "issue-1",
      filename: "design.png",
      mimeType: "image/png",
      byteSize: 10,
      contentArtifact: artifact("attachment-1.json")
    }
  ],
  parentsSubtasks: [
    {
      id: "parent-1:subtask-1",
      parentIssueId: "issue-1",
      subtaskIssueId: "issue-2"
    }
  ],
  epics: [
    {
      id: "epic-1",
      key: "APP-EPIC",
      name: "Epic",
      issueIds: ["issue-2", "issue-1"]
    }
  ],
  sprints: [
    {
      id: "sprint-1",
      name: "Sprint 1",
      state: "active",
      issueIds: ["issue-2", "issue-1"],
      startsAt: null,
      endsAt: null
    }
  ],
  versionsReleases: [
    {
      id: "version-1",
      name: "1.0",
      released: false,
      releaseDate: null,
      issueIds: ["issue-2", "issue-1"]
    }
  ],
  ranks: [{ id: "rank-1", issueId: "issue-1", rank: "0|i00000:" }],
  links: [
    {
      id: "link-1",
      type: "blocks",
      inwardIssueId: "issue-1",
      outwardIssueId: "issue-2"
    }
  ],
  restrictions: [
    {
      id: "restriction-1",
      targetKind: "comment",
      targetId: "comment-1",
      source: "role"
    }
  ],
  productApps: [
    {
      id: "jira-software",
      kind: "product",
      name: "Jira Software",
      detected: true
    },
    { id: "tempo", kind: "app", name: "Tempo", detected: false }
  ],
  customFields: [
    {
      id: "customfield_10001",
      name: "Team",
      type: "string",
      valuesArtifact: artifact("customfield_10001.json")
    }
  ],
  coverage: [
    { category: "worklogs", visibility: "visible-only", reason: "permissions" },
    { category: "issues", visibility: "complete", reason: null }
  ],
  warnings: [
    { id: "warning-1", category: "adf", message: "Unknown node retained" }
  ],
  rawArtifacts: [artifact("raw/z.json"), artifact("raw/a.json")],
  schemaVersions: [
    { id: "manifest", version: "2" },
    { id: "jira-cloud", version: "3" }
  ],
  converterVersions: [{ id: "adf-to-markdown", version: "1" }]
}

describe("JiraMigrationManifestV2", () => {
  it("round-trips every artifact-backed normalized category", () => {
    const json = Schema.encodeSync(
      Schema.fromJsonString(JiraMigrationManifestV2)
    )(manifestV2)
    const decoded = Schema.decodeSync(
      Schema.fromJsonString(JiraMigrationManifestV2)
    )(json)

    expect(decoded).toEqual(manifestV2)
    expect(json).not.toContain("rawPages")
  })

  it("normalizes every stable-id collection without mutating the input", () => {
    const normalized = normalizeJiraMigrationManifestV2(manifestV2)

    expect(normalized.fieldDefinitions.map(({ id }) => id)).toEqual([
      "field-1",
      "field-2"
    ])
    expect(normalized.identities.map(({ accountId }) => accountId)).toEqual([
      "account-a",
      "account-b"
    ])
    expect(normalized.issues.map(({ id }) => id)).toEqual([
      "issue-1",
      "issue-2"
    ])
    expect(normalized.issues[1]?.labelIds).toEqual(["a", "z"])
    expect(normalized.epics[0]?.issueIds).toEqual(["issue-1", "issue-2"])
    expect(normalized.rawArtifacts.map(({ key }) => key)).toEqual([
      "raw/a.json",
      "raw/z.json"
    ])
    expect(manifestV2.fieldDefinitions[0]?.id).toBe("field-2")
  })
})
