import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import type { JiraMigrationManifest } from "./Manifest"
import {
  buildDefaultTicketIdMappings,
  buildOpenSprintConflicts,
  buildJiraStatusCreateOptions,
  buildTagCandidates,
  findTagCollisions,
  JiraMigrationMappings,
  normalizeJiraTag
} from "./Mappings"

const emptyManifest = (): JiraMigrationManifest => ({
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
  identities: [],
  statuses: [],
  issueTypes: [],
  priorities: [],
  components: [],
  issues: [],
  comments: [],
  attachments: [],
  groups: [],
  restrictions: [],
  coverage: [],
  rawPages: []
})

describe("JiraMigrationMappings", () => {
  it("models explicit decisions using only existing destination statuses", () => {
    const mappings = Schema.decodeSync(JiraMigrationMappings)({
      project: { slug: "application", key: "APP", name: "Application" },
      identities: [
        {
          sourceAccountId: "account-a",
          resolution: { kind: "link", userId: "user-1" }
        },
        {
          sourceAccountId: "account-b",
          resolution: { kind: "unlinked" }
        }
      ],
      statuses: [
        {
          sourceStatusId: "1",
          destinationStatusSlug: "ready_for_review",
          createStatus: true
        }
      ],
      issueTypes: [{ sourceIssueTypeId: "10", destinationType: "feat" }],
      priorities: [{ sourcePriorityId: "1", destinationPriority: "high" }],
      ticketIds: [{ sourceIssueId: "10001", destinationTicketId: "APP-1" }],
      restrictions: [
        { restrictionId: "r-1", resolution: "include_acknowledged" }
      ],
      acknowledgedSkippedAttachmentIds: ["attachment-1"],
      tagCollisions: [
        {
          destinationTag: "cafe-api",
          sourceIds: ["label:Cafe/API", "label:Café API"],
          resolution: "merge"
        }
      ],
      openSprintMemberships: [
        { sourceIssueId: "10001", selectedGroupId: "sprint-active" }
      ]
    })

    expect(mappings.identities[1]?.resolution.kind).toBe("unlinked")
    expect(mappings.statuses[0]).toMatchObject({
      destinationStatusSlug: "ready_for_review",
      createStatus: true
    })
  })
})

describe("buildJiraStatusCreateOptions", () => {
  it("uses canonical baseline styling while keeping created statuses nonterminal", () => {
    expect(
      buildJiraStatusCreateOptions([
        { id: "status-new", name: "Backlog", categoryKey: "new" },
        {
          id: "status-progress",
          name: "Ready for review",
          categoryKey: "indeterminate"
        },
        { id: "status-complete", name: "Released", categoryKey: "done" }
      ])
    ).toEqual([
      {
        sourceStatusId: "status-complete",
        createOption: {
          slug: "released",
          label: "Released",
          icon: "CircleCheck",
          color: "#22c55e",
          isTerminal: false
        }
      },
      {
        sourceStatusId: "status-new",
        createOption: {
          slug: "backlog",
          label: "Backlog",
          icon: "CircleDashed",
          color: "#a3a3a3",
          isTerminal: false
        }
      },
      {
        sourceStatusId: "status-progress",
        createOption: {
          slug: "ready_for_review",
          label: "Ready for review",
          icon: "CircleDot",
          color: "#3b82f6",
          isTerminal: false
        }
      }
    ])
  })

  it("returns null for empty or overlong labels and hashes reserved or colliding slugs", () => {
    expect(
      buildJiraStatusCreateOptions([
        { id: "status-empty", name: "中文", categoryKey: "new" },
        { id: "status-long", name: `${"A".repeat(40)}!`, categoryKey: "new" },
        { id: "status-done", name: "Done", categoryKey: "done" },
        { id: "status-a", name: "Ready Review!", categoryKey: "new" },
        {
          id: "status-b",
          name: "Ready Review",
          categoryKey: "indeterminate"
        }
      ])
    ).toEqual([
      {
        sourceStatusId: "status-a",
        createOption: expect.objectContaining({
          slug: "ready_review_1fa26ffd"
        })
      },
      {
        sourceStatusId: "status-b",
        createOption: expect.objectContaining({
          slug: "ready_review_dd09f7ba"
        })
      },
      {
        sourceStatusId: "status-done",
        createOption: expect.objectContaining({ slug: "done_71b51c4b" })
      },
      { sourceStatusId: "status-empty", createOption: null },
      { sourceStatusId: "status-long", createOption: null }
    ])
  })

  it("lets identical source labels and descriptors share one candidate", () => {
    const candidates = buildJiraStatusCreateOptions([
      { id: "status-1", name: "QA Review", categoryKey: "indeterminate" },
      { id: "status-2", name: "QA Review", categoryKey: "indeterminate" }
    ])

    expect(candidates.map(({ createOption }) => createOption?.slug)).toEqual([
      "qa_review",
      "qa_review"
    ])
  })
})

describe("buildDefaultTicketIdMappings", () => {
  it("keeps compatible Jira keys and their source number gaps", () => {
    const manifest: JiraMigrationManifest = {
      ...emptyManifest(),
      issues: [
        {
          id: "10004",
          key: "APP-4",
          issueNumber: 4,
          summary: "Fourth",
          description: null,
          statusId: "1",
          issueTypeId: "10",
          priorityId: null,
          assigneeAccountId: null,
          labels: [],
          componentIds: [],
          groupIds: [],
          parentIssueId: null,
          attachmentIds: [],
          restricted: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
          raw: {}
        },
        {
          id: "10001",
          key: "APP-1",
          issueNumber: 1,
          summary: "First",
          description: null,
          statusId: "1",
          issueTypeId: "10",
          priorityId: null,
          assigneeAccountId: null,
          labels: [],
          componentIds: [],
          groupIds: [],
          parentIssueId: null,
          attachmentIds: [],
          restricted: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
          raw: {}
        },
        {
          id: "10002",
          key: "bad-2",
          issueNumber: 2,
          summary: "Invalid",
          description: null,
          statusId: "1",
          issueTypeId: "10",
          priorityId: null,
          assigneeAccountId: null,
          labels: [],
          componentIds: [],
          groupIds: [],
          parentIssueId: null,
          attachmentIds: [],
          restricted: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
          raw: {}
        }
      ]
    }

    expect(buildDefaultTicketIdMappings(manifest)).toEqual([
      { sourceIssueId: "10001", destinationTicketId: "APP-1" },
      { sourceIssueId: "10004", destinationTicketId: "APP-4" }
    ])
  })
})

describe("Jira tag normalization", () => {
  it("normalizes labels and reserves the component namespace within 31 characters", () => {
    expect(normalizeJiraTag("  Café/API  ", "label")).toBe("cafe-api")
    expect(
      normalizeJiraTag("A component name that is much too long", "component")
    ).toBe("component:a-component-name-that")
  })

  it("detects distinct source values that normalize to the same destination tag", () => {
    const manifest: JiraMigrationManifest = {
      ...emptyManifest(),
      components: [
        { id: "component-1", name: "API", description: null, raw: {} }
      ],
      issues: [
        {
          id: "10001",
          key: "APP-1",
          issueNumber: 1,
          summary: "First",
          description: null,
          statusId: "1",
          issueTypeId: "10",
          priorityId: null,
          assigneeAccountId: null,
          labels: ["Café API", "Cafe/API"],
          componentIds: ["component-1"],
          groupIds: [],
          parentIssueId: null,
          attachmentIds: [],
          restricted: false,
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
          raw: {}
        }
      ]
    }

    const candidates = buildTagCandidates(manifest)

    expect(candidates.map(({ destinationTag }) => destinationTag)).toEqual([
      "component:api",
      "cafe-api",
      "cafe-api"
    ])
    expect(findTagCollisions(candidates)).toEqual([
      {
        destinationTag: "cafe-api",
        sourceIds: ["label:Cafe/API", "label:Café API"]
      }
    ])
  })
})

describe("buildOpenSprintConflicts", () => {
  it("requires a decision only for competing active or future memberships", () => {
    const manifest: JiraMigrationManifest = {
      ...emptyManifest(),
      groups: [
        {
          id: "done",
          kind: "sprint",
          name: "Done",
          description: null,
          state: "completed",
          issueIds: ["10001"],
          startsAt: null,
          endsAt: null,
          completedAt: "2026-08-01T00:00:00Z",
          raw: {}
        },
        {
          id: "active",
          kind: "sprint",
          name: "Active",
          description: null,
          state: "active",
          issueIds: ["10001"],
          startsAt: null,
          endsAt: null,
          completedAt: null,
          raw: {}
        },
        {
          id: "future",
          kind: "sprint",
          name: "Future",
          description: null,
          state: "future",
          issueIds: ["10001"],
          startsAt: null,
          endsAt: null,
          completedAt: null,
          raw: {}
        }
      ]
    }

    expect(buildOpenSprintConflicts(manifest)).toEqual([
      { sourceIssueId: "10001", candidateGroupIds: ["active", "future"] }
    ])
  })
})
