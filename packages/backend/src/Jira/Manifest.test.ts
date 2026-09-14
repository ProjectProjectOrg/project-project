import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import { JiraMigrationManifest, normalizeJiraManifest } from "./Manifest"

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
