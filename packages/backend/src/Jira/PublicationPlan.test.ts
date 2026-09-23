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
import { Effect } from "effect"
import { AttachmentId } from "@projectproject/shared"
import { JiraMigrationManifestV2 } from "./Manifest"
import {
  prepareJiraPublication,
  finalizeJiraPublication,
  JiraPublicationPlanV1,
  jiraAttachmentId
} from "./PublicationPlan"
import { persistJiraPublicationPlan } from "./Import"
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
  it("embeds image attachments by content type, not by their display text", () => {
    const source = manifest()
    const targets = createJiraReferenceTargets(source, mappings(), {
      "attachment-1": "/api/orgs/acme/attachments/A1"
    })
    const text = convertedText("a", [
      {
        kind: "jira-attachment",
        sourceId: "attachment-1",
        placeholder: "a",
        originalUrl: null,
        fallbackText: "Login screen"
      }
    ])

    expect(rewriteJiraPublicationText(text, targets)).toBe(
      "![Login screen](/api/orgs/acme/attachments/A1)"
    )
  })

  it("links non-image attachments even when the display text looks like a filename", () => {
    const source = manifest()
    const withDocument = {
      ...source,
      attachments: [
        {
          ...source.attachments[0]!,
          id: "attachment-2",
          filename: "spec.pdf",
          mimeType: "application/pdf"
        }
      ]
    }
    const targets = createJiraReferenceTargets(withDocument, mappings(), {
      "attachment-2": "/api/orgs/acme/attachments/A2"
    })
    const text = convertedText("a", [
      {
        kind: "jira-attachment",
        sourceId: "attachment-2",
        placeholder: "a",
        originalUrl: null,
        fallbackText: "screenshot.png"
      }
    ])

    expect(rewriteJiraPublicationText(text, targets)).toBe(
      "[screenshot.png](/api/orgs/acme/attachments/A2)"
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
    expect(result.plan.createdStatuses).toHaveLength(1)
    expect(result.plan.createdStatuses[0]).toMatchObject({
      slug: "qa_review",
      label: "QA Review",
      icon: "CircleDot",
      isTerminal: false
    })
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

const createdAt = "2026-09-14T12:00:00.000Z"
const sourceV2 = () => {
  const source = manifest()
  return Schema.decodeUnknownSync(JiraMigrationManifestV2)({
    ...source,
    version: 2,
    scanRevision: 1,
    source: {
      ...source.source,
      visibleAccount: {
        accountId: "account-linked",
        displayName: "Linked User",
        caveat: "Visible account only"
      }
    },
    workflow: { executionId: "execution-1", attempt: 1 },
    issues: source.issues.map(({ description, labels, ...issue }) => ({
      ...issue,
      descriptionArtifact: null,
      reporterAccountId: null,
      labelIds: labels
    })),
    comments: [],
    attachments: [],
    fieldDefinitions: [],
    workflows: [],
    changelogs: [],
    worklogs: [],
    watchers: [],
    votes: [],
    parentsSubtasks: [],
    epics: [],
    sprints: [],
    versionsReleases: [],
    ranks: [],
    links: [],
    productApps: [],
    customFields: [],
    warnings: [],
    rawArtifacts: [],
    schemaVersions: [{ id: "manifest", version: "2" }],
    converterVersions: [{ id: "adf", version: "1" }]
  })
}
const preparationInput = () => ({
  manifest: sourceV2(),
  manifestSha256: "a".repeat(64),
  configurationRevision: 7,
  migrationCreatedAt: createdAt,
  organizationId: "org-1",
  orgSlug: "acme",
  ownerId: "user-1",
  storageKeyPrefix: "storage",
  users: [{ userId: "user-1", username: "linked" }],
  configuration: {
    destination: { slug: "application", key: "APP", name: "Application" },
    identities: [
      { jiraAccountId: "account-linked", projectProjectUserId: "user-1" },
      { jiraAccountId: "account-unlinked", projectProjectUserId: null }
    ],
    statuses: [{ jiraStatusId: "status-1", projectStatusSlug: "done" }],
    issueTypes: [{ jiraIssueTypeId: "type-1", projectType: "other" }],
    priorities: [{ jiraPriorityId: "priority-1", projectPriority: "high" }],
    tags: [],
    activeFutureSprintChoices: [],
    restrictedContent: { policy: "exclude" },
    skippedAttachmentIds: [],
    attachmentSkipsAccepted: false
  },
  environment: {
    existingProjectSlugs: [],
    existingProjectKeys: [],
    existingTicketIds: [],
    existingUserIds: ["user-1"],
    existingStatusSlugs: ["todo", "in_progress", "done"]
  },
  source: { projectDescription: null, artifacts: [] }
})

describe("immutable v2 publication", () => {
  it("stores the finalized plan under its content revision with a bounded batch count", async () => {
    const prepared = await Effect.runPromise(
      prepareJiraPublication(preparationInput())
    )
    const writes: Array<
      Readonly<{
        coordinates: Readonly<{ area: string; kind: string; identity: string }>
        value: unknown
      }>
    > = []
    const ref = {
      key: "migrations/jira/migration-1/scan-1/publication/plan-v1/test.json",
      contentType: "application/json",
      byteSize: 100,
      sha256: "b".repeat(64)
    }
    const result = await Effect.runPromise(
      persistJiraPublicationPlan(prepared, [], {
        writeJson: (_orgSlug, coordinates, value) =>
          Effect.sync(() => {
            writes.push({ coordinates, value })
            return ref
          })
      })
    )
    expect(result.planRef).toEqual(ref)
    expect(result.documentBatchCount).toBe(1)
    expect(writes).toHaveLength(1)
    const [write] = writes
    if (!write) throw new Error("expected a stored plan")
    expect(write.coordinates).toMatchObject({
      area: "publication",
      kind: "plan-v1",
      identity: result.publicationRevision
    })
    expect(
      Schema.decodeUnknownSync(JiraPublicationPlanV1)(write.value).documents
        .length
    ).toBeGreaterThan(0)
  })
  it("derives schema-valid attachment IDs from source identity and creation time", () => {
    const id = jiraAttachmentId("migration-1", "jira-attachment-88", createdAt)
    expect(Schema.is(AttachmentId)(id)).toBe(true)
    expect(id).toBe("01M2FWKNG063RBJJS94CSW4C64")
    expect(id).toBe(
      jiraAttachmentId("migration-1", "jira-attachment-88", createdAt)
    )
    expect(id).not.toBe(
      jiraAttachmentId("migration-1", "jira-attachment-89", createdAt)
    )
  })
  it("freezes exact documents and rows preserving gaps and excluding provenance revisions from final bytes", async () => {
    const input = preparationInput()
    const prepared = await Effect.runPromise(prepareJiraPublication(input))
    expect(prepared.configurationRevision).toBe(7)
    expect(prepared.manifestSha256).toBe("a".repeat(64))
    const result = await Effect.runPromise(
      finalizeJiraPublication(prepared, [])
    )
    expect(result.plan.version).toBe(1)
    expect(Object.isFrozen(result.plan)).toBe(true)
    expect(result.plan.manifestVersion).toBe(2)
    expect(result.plan.indexes.project.nextTicketNumber).toBe(5)
    expect(result.plan.indexes.tickets.map((row) => row.ticketId)).toEqual([
      "APP-1",
      "APP-4"
    ])
    expect(result.plan.documents.map((doc) => doc.path)).toEqual([
      "project.md",
      "tickets/APP-1.md",
      "tickets/APP-4.md"
    ])
    expect(result.plan.groups).toEqual([])
    const revised = await Effect.runPromise(
      prepareJiraPublication({
        ...input,
        configurationRevision: 8,
        manifest: {
          ...input.manifest,
          issues: input.manifest.issues.toReversed()
        }
      })
    )
    const same = await Effect.runPromise(finalizeJiraPublication(revised, []))
    expect(same.bytes).toEqual(result.bytes)
    expect(same.publicationRevision).toBe(result.publicationRevision)
  })
  it("blocks incompatible keys and collisions before preparing", async () => {
    const input = preparationInput()
    await expect(
      Effect.runPromise(
        prepareJiraPublication({
          ...input,
          configuration: {
            ...input.configuration,
            destination: { ...input.configuration.destination, key: "OTHER" }
          }
        })
      )
    ).rejects.toThrow("incompatible-project-key")
    await expect(
      Effect.runPromise(
        prepareJiraPublication({
          ...input,
          environment: {
            ...input.environment,
            existingProjectSlugs: ["application"],
            existingProjectKeys: ["APP"],
            existingTicketIds: ["APP-4"]
          }
        })
      )
    ).rejects.toThrow("project-slug-collision")
  })
})

const artifact = (key: string, value: unknown) => ({
  ref: {
    key,
    sha256: "b".repeat(64),
    byteSize: 1,
    contentType: "application/json"
  },
  value
})

it("requires actual outcomes and permits only individually accepted skips", async () => {
  const input = preparationInput()
  const metadata = artifact("attachment", { id: "attachment-1" })
  const withAttachment = {
    ...input,
    manifest: {
      ...input.manifest,
      attachments: [
        {
          id: "attachment-1",
          issueId: "issue-1",
          filename: "image.png",
          mimeType: "image/png",
          byteSize: 100,
          metadataArtifact: metadata.ref,
          downloadUrl: "https://jira/image",
          jiraUrl: null,
          downloadAllowed: true
        }
      ]
    },
    source: { ...input.source, artifacts: [metadata] }
  }
  const prepared = await Effect.runPromise(
    prepareJiraPublication(withAttachment)
  )
  await expect(
    Effect.runPromise(finalizeJiraPublication(prepared, []))
  ).rejects.toThrow("missing-attachment-outcome")
  await expect(
    Effect.runPromise(
      finalizeJiraPublication(prepared, [
        { sourceAttachmentId: "attachment-1", kind: "skipped" }
      ])
    )
  ).rejects.toThrow("unaccepted-attachment-skip")
  const copied = {
    sourceAttachmentId: "attachment-1",
    kind: "copied",
    attachmentId: prepared.attachments[0]!.id,
    objectKey: prepared.attachments[0]!.objectKey,
    byteSize: 100,
    contentType: "image/png",
    contentSha256: "c".repeat(64)
  }
  const result = await Effect.runPromise(
    finalizeJiraPublication(prepared, [copied])
  )
  expect(result.plan.indexes.attachments).toHaveLength(1)
  expect(result.plan.indexes.attachments[0]).toMatchObject({
    status: "live",
    byteSize: 100
  })
  await expect(
    Effect.runPromise(finalizeJiraPublication(prepared, [copied, copied]))
  ).rejects.toThrow("duplicate-attachment-outcome")
  await expect(
    Effect.runPromise(
      finalizeJiraPublication(prepared, [
        { ...copied, sourceAttachmentId: "foreign" }
      ])
    )
  ).rejects.toThrow("foreign-attachment-outcome")
  await expect(
    Effect.runPromise(
      finalizeJiraPublication(prepared, [{ ...copied, byteSize: 101 }])
    )
  ).rejects.toThrow("contradictory-attachment-outcome")
  const skipped = await Effect.runPromise(
    prepareJiraPublication({
      ...withAttachment,
      configurationRevision: 8,
      configuration: {
        ...input.configuration,
        skippedAttachmentIds: ["attachment-1"],
        attachmentSkipsAccepted: true
      }
    })
  )
  expect(skipped.projectId).toBe(prepared.projectId)
  expect(skipped.attachments[0]!.id).toBe(prepared.attachments[0]!.id)
  const partial = await Effect.runPromise(
    finalizeJiraPublication(skipped, [
      { sourceAttachmentId: "attachment-1", kind: "skipped" }
    ])
  )
  expect(partial.plan.indexes.attachments).toEqual([])
  expect(partial.plan.report.partialSuccess).toBe(true)
})

it("removes excluded bodies and opaque nested envelopes from every permanent output while disclosure retains them", async () => {
  const input = preparationInput()
  const marker = "RESTRICTED_BODY_MARKER"
  const text = artifact("comment-body", convertedText(marker, []))
  const raw = artifact("raw-page", {
    issues: [
      {
        id: "issue-1",
        fields: {
          comment: { comments: [{ id: "comment-secret", body: marker }] },
          worklog: { worklogs: [{ id: "worklog-secret", comment: marker }] }
        },
        renderedFields: { description: marker },
        unsupported: { unknownEnvelope: marker }
      }
    ]
  })
  const restricted = {
    ...input,
    manifest: {
      ...input.manifest,
      comments: [
        {
          id: "comment-secret",
          issueId: "issue-1",
          authorAccountId: "account-unlinked",
          bodyArtifact: text.ref,
          createdAt,
          updatedAt: null,
          restricted: true
        }
      ],
      restrictions: [
        {
          id: "restriction-1",
          targetKind: "comment",
          targetId: "comment-secret",
          source: "role"
        }
      ],
      rawArtifacts: [raw.ref]
    },
    source: { ...input.source, artifacts: [text, raw] }
  }
  const result = await Effect.runPromise(
    finalizeJiraPublication(
      await Effect.runPromise(prepareJiraPublication(restricted)),
      []
    )
  )
  expect(new TextDecoder().decode(result.bytes)).not.toContain(marker)
  expect(result.plan.archive.exclusions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: "comment-secret",
        excludedReason: "excluded_by_user"
      })
    ])
  )
  const disclosed = {
    ...restricted,
    configuration: {
      ...input.configuration,
      restrictedContent: { policy: "include", disclosureAccepted: true }
    }
  }
  const retained = await Effect.runPromise(
    finalizeJiraPublication(
      await Effect.runPromise(prepareJiraPublication(disclosed)),
      []
    )
  )
  expect(new TextDecoder().decode(retained.bytes)).toContain(marker)
})

it("rejects orphan records, missing choices for unused metadata, and malformed owned source values", async () => {
  const input = preparationInput()
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: {
          ...input.manifest,
          statuses: [
            ...input.manifest.statuses,
            { id: "unused", name: "Waiting", categoryKey: "new" }
          ]
        }
      })
    )
  ).rejects.toThrow("missing-status-mapping")
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: {
          ...input.manifest,
          watchers: [
            { id: "watcher", issueId: "foreign", accountId: "account-linked" }
          ]
        }
      })
    )
  ).rejects.toThrow("invalid-source-reference")
  await expect(
    Effect.runPromise(
      prepareJiraPublication({ ...input, migrationCreatedAt: "2026-99-99Tbad" })
    )
  ).rejects.toThrow("invalid-source-timestamp")
  const malformed = artifact("custom", [{ issueId: 123, value: "bad" }])
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: {
          ...input.manifest,
          customFields: [
            {
              id: "custom",
              name: "custom",
              type: "string",
              valuesArtifact: malformed.ref
            }
          ]
        },
        source: { ...input.source, artifacts: [malformed] }
      })
    )
  ).rejects.toThrow("invalid-custom-field-values")
})

it("detaches immutable preparation from mutable caller objects", async () => {
  const input = preparationInput()
  const prepared = await Effect.runPromise(prepareJiraPublication(input))
  input.configuration.destination.name = "Changed after acceptance"
  expect(prepared.configuration.destination.name).toBe("Application")
  expect(Object.isFrozen(prepared)).toBe(true)
  expect(Object.isFrozen(prepared.configuration.destination)).toBe(true)
})

it.each([
  {
    identities: [
      { jiraAccountId: "account-linked", projectProjectUserId: "foreign" },
      { jiraAccountId: "account-unlinked", projectProjectUserId: null }
    ]
  },
  { statuses: [{ jiraStatusId: "status-1", projectStatusSlug: "missing" }] },
  { issueTypes: [{ jiraIssueTypeId: "type-1", projectType: "invalid" }] },
  {
    priorities: [{ jiraPriorityId: "priority-1", projectPriority: "invalid" }]
  },
  {
    activeFutureSprintChoices: [
      { jiraIssueId: "issue-1", jiraSprintId: "foreign" }
    ]
  },
  { restrictedContent: { policy: "include", disclosureAccepted: false } },
  { skippedAttachmentIds: ["foreign"], attachmentSkipsAccepted: true }
])("rejects invalid mapping choices %j", async (patch) => {
  const input = preparationInput()
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        configuration: { ...input.configuration, ...patch }
      })
    )
  ).rejects.toThrow()
})

it("archives every v2 category and does not create native epic or release groups", async () => {
  const input = preparationInput()
  const custom = artifact("custom", [
    { issueId: "issue-1", value: { preserved: "custom payload" } }
  ])
  const worklog = artifact("worklog", {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Work performed" }] }
    ]
  })
  const withCategories = {
    ...input,
    manifest: {
      ...input.manifest,
      fieldDefinitions: [
        { id: "custom", key: "custom", name: "Custom", type: "string" }
      ],
      workflows: [
        { id: "workflow", name: "Workflow", statusIds: ["status-1"] }
      ],
      changelogs: [
        {
          id: "change",
          issueId: "issue-1",
          authorAccountId: "account-linked",
          createdAt,
          changes: [{ fieldId: "summary", from: "Old", to: "New" }]
        }
      ],
      worklogs: [
        {
          id: "worklog",
          issueId: "issue-1",
          authorAccountId: "account-linked",
          seconds: 60,
          startedAt: createdAt,
          bodyArtifact: worklog.ref,
          restricted: false
        }
      ],
      watchers: [
        { id: "watcher", issueId: "issue-1", accountId: "account-linked" }
      ],
      votes: [{ id: "vote", issueId: "issue-1", accountId: "account-linked" }],
      parentsSubtasks: [
        { id: "parent", parentIssueId: "issue-1", subtaskIssueId: "issue-4" }
      ],
      epics: [
        { id: "epic", key: "APP-10", name: "Epic", issueIds: ["issue-1"] }
      ],
      sprints: [
        {
          id: "sprint",
          name: "Sprint",
          state: "completed",
          issueIds: ["issue-1"],
          startsAt: null,
          endsAt: createdAt
        }
      ],
      versionsReleases: [
        {
          id: "release",
          name: "Release",
          released: true,
          releaseDate: "2026-09-14",
          issueIds: ["issue-1"]
        }
      ],
      ranks: [{ id: "rank", issueId: "issue-1", rank: "rank-value" }],
      links: [
        {
          id: "link",
          type: "blocks",
          inwardIssueId: "issue-1",
          outwardIssueId: "EXTERNAL-99"
        }
      ],
      productApps: [
        { id: "software", kind: "product", name: "Software", detected: true },
        { id: "app", kind: "app", name: "App", detected: true }
      ],
      customFields: [
        {
          id: "custom",
          name: "Custom",
          type: "string",
          valuesArtifact: custom.ref
        }
      ],
      coverage: [
        {
          category: "issues",
          visibility: "visible-only",
          reason: "Account scope"
        }
      ],
      warnings: [{ id: "warning", category: "app", message: "Unsupported app" }]
    },
    source: { ...input.source, artifacts: [custom, worklog] }
  }
  const result = await Effect.runPromise(
    finalizeJiraPublication(
      await Effect.runPromise(prepareJiraPublication(withCategories)),
      []
    )
  )
  expect(result.plan.groups.map((group) => group.kind)).toEqual(["sprint"])
  expect(result.plan.archive.categories.customFields).toEqual([
    {
      id: "custom",
      name: "Custom",
      type: "string",
      values: [{ issueId: "issue-1", value: { preserved: "custom payload" } }]
    }
  ])
  for (const category of [
    "fieldDefinitions",
    "workflows",
    "identities",
    "statuses",
    "issueTypes",
    "priorities",
    "components",
    "issues",
    "changelogs",
    "worklogs",
    "watchers",
    "votes",
    "parentsSubtasks",
    "epics",
    "sprints",
    "versionsReleases",
    "ranks",
    "links",
    "productApps",
    "customFields",
    "coverage",
    "warnings"
  ])
    expect(result.plan.report.archivedCounts[category]).toBeGreaterThan(0)
  expect(result.plan.report.markdown).toContain(
    "Inaccessible data may be absent"
  )
  expect(
    result.plan.documents.find(
      (document) => document.path === "tickets/APP-1.md"
    )!.content
  ).not.toContain("custom payload")
})

it("keeps attachment identity when metadata changes and creates only references present in final ticket content", async () => {
  const input = preparationInput()
  const metadata = artifact("attachment-metadata", { id: "attachment" })
  const description = artifact(
    "description",
    convertedText("\uE000media\uE001", [
      {
        kind: "jira-attachment",
        sourceId: "attachment",
        placeholder: "\uE000media\uE001",
        originalUrl: null,
        fallbackText: "Diagram"
      }
    ])
  )
  const source = {
    ...input,
    manifest: {
      ...input.manifest,
      issues: input.manifest.issues.map((issue) =>
        issue.id === "issue-4"
          ? { ...issue, descriptionArtifact: description.ref }
          : issue
      ),
      attachments: [
        {
          id: "attachment",
          issueId: "issue-1",
          filename: "diagram.png",
          mimeType: "image/png",
          byteSize: 100,
          metadataArtifact: metadata.ref,
          downloadUrl: "https://jira/attachment",
          jiraUrl: null,
          downloadAllowed: true
        }
      ]
    },
    source: { ...input.source, artifacts: [metadata, description] }
  }
  const prepared = await Effect.runPromise(prepareJiraPublication(source))
  const changed = await Effect.runPromise(
    prepareJiraPublication({
      ...source,
      manifest: {
        ...source.manifest,
        attachments: source.manifest.attachments.map((attachment) => ({
          ...attachment,
          filename: "renamed.png",
          byteSize: 200
        }))
      }
    })
  )
  expect(changed.attachments[0]!.id).toBe(prepared.attachments[0]!.id)
  const attachment = prepared.attachments[0]!
  const final = await Effect.runPromise(
    finalizeJiraPublication(prepared, [
      {
        kind: "copied",
        sourceAttachmentId: "attachment",
        attachmentId: attachment.id,
        objectKey: attachment.objectKey,
        byteSize: 100,
        contentType: "image/png",
        contentSha256: "c".repeat(64)
      }
    ])
  )
  expect(final.plan.tickets[1]!.body).toContain(attachment.url)
  expect(
    final.plan.indexes.attachmentReferences.map(
      (reference) => reference.ticketId
    )
  ).toEqual(["APP-4"])
})

it("keeps excluded issue and worklog text out of native data, archive, report and maps", async () => {
  const input = preparationInput()
  const marker = "RESTRICTED_ISSUE_AND_WORKLOG"
  const text = artifact("secret-issue", convertedText(marker, []))
  const worklog = artifact("secret-worklog", {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: marker }] }]
  })
  const prepared = await Effect.runPromise(
    prepareJiraPublication({
      ...input,
      manifest: {
        ...input.manifest,
        issues: input.manifest.issues.map((issue) =>
          issue.id === "issue-4"
            ? { ...issue, summary: marker, descriptionArtifact: text.ref }
            : issue
        ),
        worklogs: [
          {
            id: "worklog-secret",
            issueId: "issue-1",
            authorAccountId: "account-linked",
            seconds: 10,
            startedAt: createdAt,
            bodyArtifact: worklog.ref,
            restricted: true
          }
        ],
        restrictions: [
          {
            id: "issue-restriction",
            targetKind: "issue",
            targetId: "issue-4",
            source: "security-level"
          },
          {
            id: "worklog-restriction",
            targetKind: "worklog",
            targetId: "worklog-secret",
            source: "role"
          }
        ]
      },
      source: { ...input.source, artifacts: [text, worklog] }
    })
  )
  const final = await Effect.runPromise(finalizeJiraPublication(prepared, []))
  expect(new TextDecoder().decode(final.bytes)).not.toContain(marker)
  expect(final.plan.maps.issues).toEqual([
    { sourceId: "issue-1", targetId: "APP-1" }
  ])
  expect(
    final.plan.archive.exclusions.map((exclusion) => exclusion.sourceId)
  ).toEqual(["issue-4", "worklog-secret"])
})

it("binds exact artifact references and rejects legacy input versions", async () => {
  const input = preparationInput()
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: { ...input.manifest, version: 1 }
      })
    )
  ).rejects.toThrow("invalid-configuration-or-source-schema")
  const body = artifact("missing", convertedText("Body", []))
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: {
          ...input.manifest,
          issues: input.manifest.issues.map((issue) => ({
            ...issue,
            descriptionArtifact: body.ref
          }))
        }
      })
    )
  ).rejects.toThrow("missing-source-artifact")
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: { ...input.manifest, rawArtifacts: [body.ref] },
        source: {
          ...input.source,
          artifacts: [{ ...body, ref: { ...body.ref, sha256: "c".repeat(64) } }]
        }
      })
    )
  ).rejects.toThrow("foreign-or-mismatched-source-artifact")
})

it("excludes an unavailable attachment with its restricted issue without demanding separate skip consent", async () => {
  const input = preparationInput()
  const metadata = artifact("attachment", { id: "attachment" })
  const prepared = await Effect.runPromise(
    prepareJiraPublication({
      ...input,
      manifest: {
        ...input.manifest,
        attachments: [
          {
            id: "attachment",
            issueId: "issue-4",
            filename: "secret.png",
            mimeType: "image/png",
            byteSize: 100,
            metadataArtifact: metadata.ref,
            downloadUrl: null,
            jiraUrl: null,
            downloadAllowed: false
          }
        ],
        restrictions: [
          {
            id: "restriction",
            targetKind: "issue",
            targetId: "issue-4",
            source: "security-level"
          }
        ]
      },
      source: { ...input.source, artifacts: [metadata] }
    })
  )
  expect(prepared.attachments[0]!.decision).toBe("exclude")
  const final = await Effect.runPromise(
    finalizeJiraPublication(prepared, [
      { sourceAttachmentId: "attachment", kind: "excluded" }
    ])
  )
  expect(final.plan.indexes.attachments).toEqual([])
  expect(final.plan.maps.attachments).toEqual([])
})

it("blocks invalid unused status choices and conflicting semantics for the same generated status label", async () => {
  const input = preparationInput()
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: {
          ...input.manifest,
          statuses: [
            ...input.manifest.statuses,
            { id: "unused", name: "Waiting", categoryKey: "new" }
          ]
        },
        configuration: {
          ...input.configuration,
          statuses: [
            ...input.configuration.statuses,
            { jiraStatusId: "unused", projectStatusSlug: "foreign" }
          ]
        }
      })
    )
  ).rejects.toThrow("invalid-destination-status")
  const statuses = [
    { id: "status-1", name: "Review", categoryKey: "indeterminate" },
    { id: "status-2", name: "Review", categoryKey: "done" }
  ]
  const { buildJiraStatusCreateOptions } = await import("./Mappings")
  const created = buildJiraStatusCreateOptions(statuses)
  await expect(
    Effect.runPromise(
      prepareJiraPublication({
        ...input,
        manifest: { ...input.manifest, statuses },
        configuration: {
          ...input.configuration,
          statuses: created.map((option) => ({
            jiraStatusId: option.sourceStatusId,
            projectStatusSlug: option.createOption!.slug,
            createStatus: true
          }))
        }
      })
    )
  ).rejects.toThrow("created-status-collision")
})

it("writes native-readable markdown and comment indexes after resolving issue, user, and external links", async () => {
  const input = preparationInput()
  const body = artifact(
    "description",
    convertedText("\uE000issue\uE001 \uE000user\uE001 \uE000external\uE001", [
      {
        kind: "jira-issue",
        sourceId: "APP-4",
        placeholder: "\uE000issue\uE001",
        originalUrl: "https://jira/browse/APP-4",
        fallbackText: "APP-4"
      },
      {
        kind: "jira-user",
        sourceId: "account-linked",
        placeholder: "\uE000user\uE001",
        originalUrl: null,
        fallbackText: "Linked User"
      },
      {
        kind: "jira-issue",
        sourceId: "EXT-9",
        placeholder: "\uE000external\uE001",
        originalUrl: "https://jira/browse/EXT-9",
        fallbackText: "EXT-9"
      }
    ])
  )
  const comment = artifact("comment", convertedText("Comment text", []))
  const prepared = await Effect.runPromise(
    prepareJiraPublication({
      ...input,
      manifest: {
        ...input.manifest,
        issues: input.manifest.issues.map((issue) =>
          issue.id === "issue-1"
            ? { ...issue, descriptionArtifact: body.ref }
            : issue
        ),
        comments: [
          {
            id: "comment",
            issueId: "issue-1",
            authorAccountId: "account-unlinked",
            bodyArtifact: comment.ref,
            createdAt,
            updatedAt: null,
            restricted: false
          }
        ]
      },
      source: { ...input.source, artifacts: [body, comment] }
    })
  )
  const final = await Effect.runPromise(finalizeJiraPublication(prepared, []))
  const { default: matter } = await import("gray-matter")
  const { parseCommentsRegion } = await import("../comments-region")
  const document = matter(
    final.plan.documents.find(
      (document) => document.path === "tickets/APP-1.md"
    )!.content
  )
  expect(document.data).toMatchObject({
    id: "APP-1",
    status: "done",
    createdBy: "user-1",
    createdAt: "2026-09-01T10:00:00Z"
  })
  expect(document.content).toContain(
    "[APP-4](mention:ticket/APP-4) [Linked User](mention:user/user-1) [EXT-9](https://jira/browse/EXT-9)"
  )
  const comments = parseCommentsRegion(document.content)
  expect(comments).toHaveLength(1)
  expect(comments[0]).toMatchObject({
    id: final.plan.indexes.comments[0]!.id,
    origin: "jira",
    author: {
      kind: "jira",
      accountId: "account-unlinked",
      displayName: "Former User"
    },
    body: "Comment text"
  })
  expect(final.plan.indexes.comments[0]).toMatchObject({
    authorKind: "jira",
    jiraAccountId: "account-unlinked",
    authorId: null,
    ticketId: "APP-1"
  })
})

it("retains the original project description in the archive alongside its rewritten native body", async () => {
  const input = preparationInput()
  const description = convertedText("Original project description", [])
  const final = await Effect.runPromise(
    finalizeJiraPublication(
      await Effect.runPromise(
        prepareJiraPublication({
          ...input,
          source: { ...input.source, projectDescription: description }
        })
      ),
      []
    )
  )
  expect(final.plan.project.body).toBe("Original project description")
  expect(final.plan.archive.source.description).toEqual(description)
})
