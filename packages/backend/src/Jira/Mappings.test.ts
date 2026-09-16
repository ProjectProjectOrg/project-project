import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import {
  BASELINE_STATUS_COLORS,
  TAG_DEFAULT_PALETTE
} from "@projectproject/shared"
import type { JiraMigrationManifest } from "./Manifest"
import {
  buildDefaultTicketIdMappings,
  buildOpenSprintConflicts,
  buildJiraStatusCreateOptions,
  buildTagCandidates,
  findTagCollisions,
  jiraConfigurationToMappings,
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
  it("uses canonical baseline icons while keeping created statuses nonterminal", () => {
    const options = buildJiraStatusCreateOptions([
      { id: "status-new", name: "Backlog", categoryKey: "new" },
      {
        id: "status-progress",
        name: "Ready for review",
        categoryKey: "indeterminate"
      },
      { id: "status-complete", name: "Released", categoryKey: "done" }
    ])

    expect(
      options.map(({ sourceStatusId, createOption }) => ({
        sourceStatusId,
        slug: createOption?.slug,
        label: createOption?.label,
        icon: createOption?.icon,
        isTerminal: createOption?.isTerminal
      }))
    ).toEqual([
      {
        sourceStatusId: "status-complete",
        slug: "released",
        label: "Released",
        icon: "CircleCheck",
        isTerminal: false
      },
      {
        sourceStatusId: "status-new",
        slug: "backlog",
        label: "Backlog",
        icon: "CircleDashed",
        isTerminal: false
      },
      {
        sourceStatusId: "status-progress",
        slug: "ready_for_review",
        label: "Ready for review",
        icon: "CircleDot",
        isTerminal: false
      }
    ])

    for (const { createOption } of options) {
      expect(TAG_DEFAULT_PALETTE).toContain(createOption?.color)
    }
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

describe("jiraConfigurationToMappings", () => {
  const manifest: JiraMigrationManifest = {
    ...emptyManifest(),
    restrictions: [
      {
        id: "restriction-1",
        targetKind: "issue",
        targetId: "10001",
        source: "security",
        raw: {}
      }
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
        priorityId: "3",
        assigneeAccountId: null,
        labels: [],
        componentIds: [],
        groupIds: [],
        parentIssueId: null,
        attachmentIds: [],
        restricted: true,
        createdAt: "2026-09-01T10:00:00Z",
        updatedAt: "2026-09-01T10:00:00Z",
        raw: {}
      }
    ]
  }

  const baseConfiguration = {
    destination: { name: "Application", slug: "application", key: "APP" },
    identities: [
      { jiraAccountId: "acct-linked", projectProjectUserId: "user-1" },
      { jiraAccountId: "acct-unlinked", projectProjectUserId: null }
    ],
    statuses: [
      { jiraStatusId: "1", projectStatusSlug: "todo" },
      { jiraStatusId: "2", projectStatusSlug: "on_hold", createStatus: true }
    ],
    issueTypes: [{ jiraIssueTypeId: "10", projectType: "feat" }],
    priorities: [{ jiraPriorityId: "3", projectPriority: "med" }],
    tags: [],
    activeFutureSprintChoices: [
      { jiraIssueId: "10001", jiraSprintId: "sprint-2" },
      { jiraIssueId: "10002", jiraSprintId: null }
    ],
    restrictedContent: { policy: "exclude" as const },
    skippedAttachmentIds: ["att-1"],
    attachmentSkipsAccepted: true
  }

  it("produces mappings the plan schema accepts", () => {
    const mappings = jiraConfigurationToMappings(
      manifest,
      baseConfiguration as never
    )

    expect(Schema.is(JiraMigrationMappings)(mappings)).toBe(true)
    expect(mappings.project.slug).toBe("application")
    expect(mappings.identities).toEqual([
      {
        sourceAccountId: "acct-linked",
        resolution: { kind: "link", userId: "user-1" }
      },
      { sourceAccountId: "acct-unlinked", resolution: { kind: "unlinked" } }
    ])
    expect(mappings.ticketIds).toEqual([
      { sourceIssueId: "10001", destinationTicketId: "APP-1" }
    ])
  })

  it("keeps create-status intent and omits it otherwise", () => {
    const mappings = jiraConfigurationToMappings(
      manifest,
      baseConfiguration as never
    )

    expect(mappings.statuses[0]).toEqual({
      sourceStatusId: "1",
      destinationStatusSlug: "todo"
    })
    expect(mappings.statuses[1]).toEqual({
      sourceStatusId: "2",
      destinationStatusSlug: "on_hold",
      createStatus: true
    })
  })

  it("maps the restricted-content policy onto every manifest restriction", () => {
    expect(
      jiraConfigurationToMappings(manifest, baseConfiguration as never)
        .restrictions
    ).toEqual([{ restrictionId: "restriction-1", resolution: "exclude" }])

    expect(
      jiraConfigurationToMappings(manifest, {
        ...baseConfiguration,
        restrictedContent: { policy: "include", disclosureAccepted: true }
      } as never).restrictions
    ).toEqual([
      { restrictionId: "restriction-1", resolution: "include_acknowledged" }
    ])
  })

  it("carries sprint choices and acknowledged attachment skips", () => {
    const mappings = jiraConfigurationToMappings(
      manifest,
      baseConfiguration as never
    )

    expect(mappings.openSprintMemberships).toEqual([
      { sourceIssueId: "10001", selectedGroupId: "sprint-2" },
      { sourceIssueId: "10002", selectedGroupId: null }
    ])
    expect(mappings.acknowledgedSkippedAttachmentIds).toEqual(["att-1"])
  })
})

describe("created status colours", () => {
  it("gives every created status a distinct colour from the wheel", () => {
    const options = buildJiraStatusCreateOptions([
      { id: "1", name: "Development", categoryKey: "indeterminate" },
      { id: "2", name: "On hold", categoryKey: "indeterminate" },
      { id: "3", name: "Templates", categoryKey: "indeterminate" }
    ])
    const colors = options.flatMap(({ createOption }) =>
      createOption ? [createOption.color] : []
    )

    expect(colors).toHaveLength(3)
    expect(new Set(colors).size).toBe(3)
    for (const color of colors) {
      expect(TAG_DEFAULT_PALETTE).toContain(color)
      expect(BASELINE_STATUS_COLORS).not.toContain(color)
    }
  })

  it("still derives the icon from the Jira status category", () => {
    const options = buildJiraStatusCreateOptions([
      { id: "1", name: "Shipped", categoryKey: "done" },
      { id: "2", name: "Doing", categoryKey: "indeterminate" },
      { id: "3", name: "Fresh", categoryKey: "new" }
    ])

    expect(options.map(({ createOption }) => createOption?.icon)).toEqual([
      "CircleCheck",
      "CircleDot",
      "CircleDashed"
    ])
  })
})

describe("jiraConfigurationToMappings priority gaps", () => {
  const withUnprioritised = (
    priorityId: string | null
  ): JiraMigrationManifest => ({
    ...emptyManifest(),
    issues: [
      {
        id: "10001",
        key: "APP-1",
        issueNumber: 1,
        summary: "First",
        description: null,
        statusId: "1",
        issueTypeId: "10",
        priorityId,
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
  })

  const configuration = {
    destination: { name: "Application", slug: "application", key: "APP" },
    identities: [],
    statuses: [],
    issueTypes: [],
    priorities: [{ jiraPriorityId: "3", projectPriority: "med" }],
    tags: [],
    activeFutureSprintChoices: [],
    restrictedContent: { policy: "exclude" as const },
    skippedAttachmentIds: [],
    attachmentSkipsAccepted: true
  }

  it("covers issues that carry no Jira priority", () => {
    const mappings = jiraConfigurationToMappings(
      withUnprioritised(null),
      configuration as never
    )

    expect(
      mappings.priorities.find(
        ({ sourcePriorityId }) => sourcePriorityId === null
      )
    ).toEqual({ sourcePriorityId: null, destinationPriority: "med" })
    expect(Schema.is(JiraMigrationMappings)(mappings)).toBe(true)
  })

  it("does not invent a null mapping when every issue has a priority", () => {
    const mappings = jiraConfigurationToMappings(
      withUnprioritised("3"),
      configuration as never
    )

    expect(
      mappings.priorities.some(
        ({ sourcePriorityId }) => sourcePriorityId === null
      )
    ).toBe(false)
  })
})

describe("preflight honours wizard tag renames", () => {
  it("stops blocking a label that the user renamed", async () => {
    const { preflightJiraMigration } = await import("./Preflight")
    const manifest: JiraMigrationManifest = {
      ...emptyManifest(),
      issues: [
        {
          id: "10001",
          key: "APP-1",
          issueNumber: 1,
          summary: "First",
          description: null,
          statusId: "1",
          issueTypeId: "10",
          priorityId: "3",
          assigneeAccountId: null,
          labels: ["-"],
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
    const environment = {
      existingProjectSlugs: [],
      existingProjectKeys: [],
      existingTicketIds: [],
      existingUserIds: [],
      existingStatusSlugs: ["todo", "in_progress", "done"]
    }
    const base = {
      destination: { name: "Application", slug: "application", key: "APP" },
      identities: [],
      statuses: [{ jiraStatusId: "1", projectStatusSlug: "todo" }],
      issueTypes: [{ jiraIssueTypeId: "10", projectType: "feat" }],
      priorities: [{ jiraPriorityId: "3", projectPriority: "med" }],
      activeFutureSprintChoices: [],
      restrictedContent: { policy: "exclude" as const },
      skippedAttachmentIds: [],
      attachmentSkipsAccepted: true
    }

    const unnamed = preflightJiraMigration(
      manifest,
      jiraConfigurationToMappings(manifest, { ...base, tags: [] } as never),
      environment
    )
    expect(unnamed.blockers.map(({ code }) => code)).toContain(
      "unrepresentable-tag"
    )

    const renamed = preflightJiraMigration(
      manifest,
      jiraConfigurationToMappings(manifest, {
        ...base,
        tags: [
          { source: { kind: "label", value: "-" }, destinationTagName: "no" }
        ]
      } as never),
      environment
    )
    expect(renamed.blockers.map(({ code }) => code)).not.toContain(
      "unrepresentable-tag"
    )
  })
})
