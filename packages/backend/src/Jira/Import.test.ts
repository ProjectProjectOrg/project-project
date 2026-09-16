import { describe, expect, it } from "vite-plus/test"
import type { JiraConvertedText, JiraMigrationManifest } from "./Manifest"
import {
  aliasJiraMediaReferences,
  buildJiraImportPlan,
  groupColors,
  nextTicketNumberFor
} from "./Import"
import type { JiraPreflightEnvironment } from "./Preflight"
import { TAG_DEFAULT_PALETTE } from "@projectproject/shared"
import type { JiraPublicationPlan } from "./PublicationPlan"

const convertedText = (markdown: string): JiraConvertedText => ({
  markdown,
  references: [],
  warnings: [],
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
    { id: "status-open", name: "Open", categoryKey: "new", raw: {} },
    {
      id: "status-hold",
      name: "On hold",
      categoryKey: "indeterminate",
      raw: {}
    }
  ],
  issueTypes: [{ id: "type-1", name: "Bug", subtask: false, raw: {} }],
  priorities: [{ id: "priority-1", name: "High", raw: {} }],
  components: [{ id: "component-1", name: "API", description: null, raw: {} }],
  issues: [
    {
      id: "issue-1",
      key: "APP-1",
      issueNumber: 1,
      summary: "First",
      description: convertedText("Body one"),
      statusId: "status-open",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-linked",
      labels: ["Urgent"],
      componentIds: ["component-1"],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: {}
    },
    {
      id: "issue-7",
      key: "APP-7",
      issueNumber: 7,
      summary: "Seventh",
      description: null,
      statusId: "status-hold",
      issueTypeId: "type-1",
      priorityId: "priority-1",
      assigneeAccountId: "account-unlinked",
      labels: [],
      componentIds: [],
      groupIds: [],
      parentIssueId: null,
      attachmentIds: [],
      restricted: false,
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      raw: {}
    }
  ],
  comments: [
    {
      id: "comment-1",
      issueId: "issue-1",
      authorAccountId: "account-unlinked",
      authorDisplayName: "Former User",
      body: convertedText("Historical note"),
      createdAt: "2026-09-01T11:00:00Z",
      updatedAt: null,
      restricted: false,
      raw: {}
    }
  ],
  attachments: [],
  groups: [],
  restrictions: [],
  coverage: [],
  rawPages: []
})

const configuration = {
  destination: { name: "Application", slug: "application", key: "APP" },
  identities: [
    { jiraAccountId: "account-linked", projectProjectUserId: "user-1" },
    { jiraAccountId: "account-unlinked", projectProjectUserId: null }
  ],
  statuses: [
    { jiraStatusId: "status-open", projectStatusSlug: "todo" },
    {
      jiraStatusId: "status-hold",
      projectStatusSlug: "on_hold",
      createStatus: true
    }
  ],
  issueTypes: [{ jiraIssueTypeId: "type-1", projectType: "bug" }],
  priorities: [{ jiraPriorityId: "priority-1", projectPriority: "high" }],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: [],
  attachmentSkipsAccepted: true
}

const environment: JiraPreflightEnvironment = {
  existingProjectSlugs: [],
  existingProjectKeys: [],
  existingTicketIds: [],
  existingUserIds: ["user-1"],
  existingStatusSlugs: ["todo", "in_progress", "done"]
}

describe("buildJiraImportPlan", () => {
  it("turns a wizard configuration into a ready publication plan", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(result.plan.project.slug).toBe("application")
    expect(result.plan.tickets.map(({ id }) => id)).toEqual(["APP-1", "APP-7"])
    expect(result.plan.tickets[0]?.status).toBe("todo")
    expect(result.plan.tickets[0]?.type).toBe("bug")
    expect(result.plan.tickets[0]?.priority).toBe("high")
  })

  it("plans the source-named status only for the create-status row", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.createdStatuses.map(({ slug }) => slug)).toEqual([
      "on_hold"
    ])
    expect(result.plan.createdStatuses[0]?.isTerminal).toBe(false)
    expect(result.plan.tickets[1]?.status).toBe("on_hold")
  })

  it("keeps an unlinked Jira author on the comment instead of inventing a user", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.comments).toHaveLength(1)
    expect(result.plan.comments[0]?.author).toEqual({
      kind: "jira",
      displayName: "Former User",
      accountId: "account-unlinked"
    })
  })

  it("assigns only linked identities", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.tickets[0]?.assignees).toEqual(["user-1"])
    expect(result.plan.tickets[1]?.assignees).toEqual([])
  })

  it("blocks instead of publishing when the destination slug is taken", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      { ...environment, existingProjectSlugs: ["application"] },
      {}
    )

    expect(result.kind).toBe("blocked")
    if (result.kind !== "blocked") return
    expect(result.blockers.map(({ code }) => code)).toContain(
      "project-slug-collision"
    )
  })
})

describe("nextTicketNumberFor", () => {
  it("continues past the highest imported Jira number, preserving gaps", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(nextTicketNumberFor(result.plan)).toBe(8)
  })
})

describe("tag renaming", () => {
  it("uses the name chosen in the wizard instead of the suggestion", () => {
    const withRename = {
      ...configuration,
      tags: [
        { source: { kind: "label", value: "Urgent" }, destinationTagName: "p0" }
      ]
    }
    const result = buildJiraImportPlan(manifest(), withRename, environment, {})

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    const names = result.plan.tags.map(({ name }) => name)
    expect(names).toContain("p0")
    expect(names).not.toContain("urgent")
    expect(result.plan.tickets[0]?.tags).toContain("p0")
  })

  it("falls back to the derived tag when the wizard left it alone", () => {
    const result = buildJiraImportPlan(
      manifest(),
      configuration,
      environment,
      {}
    )

    if (result.kind !== "ready") throw new Error("expected a ready plan")
    expect(result.plan.tags.map(({ name }) => name)).toContain("urgent")
  })
})

describe("groupColors", () => {
  const group = (
    kind: JiraPublicationPlan["groups"][number]["kind"],
    id: string
  ) =>
    ({
      sourceGroupId: id,
      kind,
      name: id,
      body: "",
      ticketIds: [],
      startsAt: null,
      endsAt: null,
      completedAt: null
    }) satisfies JiraPublicationPlan["groups"][number]

  it("gives every sprint the flat sprint colour", () => {
    const colors = groupColors([
      group("sprint", "s1"),
      group("sprint", "s2"),
      group("sprint", "s3")
    ])

    expect(new Set(colors)).toEqual(new Set(["#777777"]))
  })

  it("gives non-sprint groups distinct palette colours", () => {
    const colors = groupColors([
      group("epic", "e1"),
      group("sprint", "s1"),
      group("milestone", "m1"),
      group("epic", "e2")
    ])

    expect(colors[1]).toBe("#777777")
    const nonSprint = [colors[0], colors[2], colors[3]]
    expect(new Set(nonSprint).size).toBe(3)
    for (const color of nonSprint) {
      expect(TAG_DEFAULT_PALETTE).toContain(color)
    }
  })

  it("only ever produces valid hex colours", () => {
    const colors = groupColors(
      Array.from({ length: 20 }, (_, i) => group("epic", `e${i}`))
    )

    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe("aliasJiraMediaReferences", () => {
  const mediaManifest = (): JiraMigrationManifest => {
    const base = manifest()
    return {
      ...base,
      attachments: [
        {
          id: "10348",
          issueId: "issue-1",
          filename: "Screenshot.png",
          mimeType: "image/png",
          byteSize: 100,
          downloadUrl: null,
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        }
      ],
      comments: [
        {
          ...base.comments[0]!,
          body: {
            markdown: "see jira-reference:000000",
            references: [
              {
                kind: "jira-attachment",
                sourceId: "573670c8-28f0-460c-93bc-5d0992659b8d",
                placeholder: "jira-reference:000000",
                originalUrl: null,
                fallbackText: "Screenshot.png"
              }
            ],
            warnings: [],
            adf: {}
          }
        }
      ]
    }
  }

  it("maps the ADF media uuid onto the copied attachment url", () => {
    const aliased = aliasJiraMediaReferences(mediaManifest(), {
      "10348": "/api/attachments/example/ATT1"
    })

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBe(
      "/api/attachments/example/ATT1"
    )
    expect(aliased["10348"]).toBe("/api/attachments/example/ATT1")
  })

  it("leaves a media reference alone when its attachment was not copied", () => {
    const aliased = aliasJiraMediaReferences(mediaManifest(), {})

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBeUndefined()
  })

  it("does not guess when the filename is ambiguous across issues", () => {
    const base = mediaManifest()
    const ambiguous: JiraMigrationManifest = {
      ...base,
      attachments: [
        ...base.attachments,
        { ...base.attachments[0]!, id: "10999", issueId: "issue-other" }
      ],
      comments: [
        {
          ...base.comments[0]!,
          issueId: "issue-unrelated"
        }
      ]
    }

    const aliased = aliasJiraMediaReferences(ambiguous, {
      "10348": "/api/attachments/example/ATT1",
      "10999": "/api/attachments/example/ATT2"
    })

    expect(aliased["573670c8-28f0-460c-93bc-5d0992659b8d"]).toBeUndefined()
  })
})

describe("embedded image references", () => {
  it("renders an imported screenshot as an inline image, not a file chip", () => {
    const base = manifest()
    const withMedia: JiraMigrationManifest = {
      ...base,
      attachments: [
        {
          id: "10348",
          issueId: "issue-1",
          filename: "Screenshot.png",
          mimeType: "image/png",
          byteSize: 100,
          downloadUrl: "https://example.atlassian.net/a/10348",
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        },
        {
          id: "10349",
          issueId: "issue-1",
          filename: "spec.pdf",
          mimeType: "application/pdf",
          byteSize: 100,
          downloadUrl: "https://example.atlassian.net/a/10349",
          jiraUrl: null,
          downloadAllowed: true,
          raw: {}
        }
      ],
      comments: [
        {
          ...base.comments[0]!,
          body: {
            markdown: "shot jira-reference:000000 doc jira-reference:000001",
            references: [
              {
                kind: "jira-attachment",
                sourceId: "media-uuid-1",
                placeholder: "jira-reference:000000",
                originalUrl: null,
                fallbackText: "Screenshot.png"
              },
              {
                kind: "jira-attachment",
                sourceId: "media-uuid-2",
                placeholder: "jira-reference:000001",
                originalUrl: null,
                fallbackText: "spec.pdf"
              }
            ],
            warnings: [],
            adf: {}
          }
        }
      ]
    }

    const urls = aliasJiraMediaReferences(withMedia, {
      "10348": "/api/attachments/example/IMG",
      "10349": "/api/attachments/example/DOC"
    })
    const result = buildJiraImportPlan(
      withMedia,
      configuration,
      environment,
      urls
    )

    if (result.kind !== "ready")
      throw new Error(`blocked: ${JSON.stringify(result.blockers)}`)
    const body = result.plan.comments[0]!.body
    expect(body).toContain("![Screenshot.png](/api/attachments/example/IMG)")
    expect(body).toContain("[spec.pdf](/api/attachments/example/DOC)")
    expect(body).not.toContain("![spec.pdf]")
  })
})
