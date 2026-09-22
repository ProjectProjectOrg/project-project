import { describe, expect, it } from "vitest"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { TagName } from "./Tag"
import {
  JiraConnection,
  JiraMigrationConfiguration,
  JiraMigrationRequirements,
  JiraProjectChoice,
  JiraSite
} from "./JiraMigration"

const decodeConnection = Schema.decodeUnknownSync(JiraConnection)
const connectedAt = DateTime.makeUnsafe("2026-09-14T12:00:00Z")

describe("JiraMigration schemas", () => {
  it("allows incomplete decision arrays while retaining destination and restriction validation", () => {
    const draft = {
      destination: { name: "Application", slug: "application", key: "APP" },
      identities: [],
      statuses: [],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { policy: "exclude" },
      skippedAttachmentIds: [],
      attachmentSkipsAccepted: false
    }
    expect(Schema.decodeUnknownSync(JiraMigrationConfiguration)(draft)).toEqual(
      draft
    )
    for (const key of ["name", "slug", "key"] as const)
      expect(() =>
        Schema.decodeUnknownSync(JiraMigrationConfiguration)({
          ...draft,
          destination: { ...draft.destination, [key]: "" }
        })
      ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(JiraMigrationConfiguration)({
        ...draft,
        restrictedContent: {}
      })
    ).toThrow()
  })

  it.each([
    {
      status: "disconnected",
      reconnectReason: null,
      connectedAt: null
    },
    {
      status: "connected",
      reconnectReason: null,
      connectedAt
    },
    {
      status: "reconnect_required",
      reconnectReason: "invalid_grant",
      connectedAt
    },
    {
      status: "reconnect_required",
      reconnectReason: "missing_scopes",
      connectedAt
    }
  ])("decodes the $status connection state", (input) => {
    expect(decodeConnection(input).status).toBe(input.status)
  })

  it.each([
    {
      status: "connected",
      reconnectReason: "invalid_grant",
      connectedAt
    },
    {
      status: "disconnected",
      reconnectReason: "missing_scopes",
      connectedAt: null
    },
    {
      status: "reconnect_required",
      reconnectReason: null,
      connectedAt
    }
  ])("rejects a contradictory connection state", (input) => {
    expect(() => decodeConnection(input)).toThrow()
  })

  it("decodes minimal site and project choices", () => {
    const site = Schema.decodeUnknownSync(JiraSite)({
      cloudId: "cloud-1",
      name: "Example",
      url: "https://example.atlassian.net",
      avatarUrl: null
    })
    const project = Schema.decodeUnknownSync(JiraProjectChoice)({
      id: "10000",
      key: "APP",
      name: "Application",
      projectTypeKey: null,
      simplified: null,
      style: null,
      avatarUrl: null
    })

    expect(site.cloudId).toBe("cloud-1")
    expect(project.key).toBe("APP")
  })

  it.each([
    [JiraSite, { cloudId: 1, name: "Example", url: "bad", avatarUrl: null }],
    [
      JiraProjectChoice,
      {
        id: "10000",
        key: null,
        name: "Application",
        projectTypeKey: null,
        simplified: null,
        style: null,
        avatarUrl: null
      }
    ]
  ])("rejects malformed public values", (schema, input) => {
    expect(() => Schema.decodeUnknownSync(schema)(input)).toThrow()
  })

  it("decodes the approved complete migration configuration", () => {
    const configuration = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
      destination: { name: "Application", slug: "application", key: "APP" },
      identities: [{ jiraAccountId: "jira-user", projectProjectUserId: null }],
      statuses: [{ jiraStatusId: "1", projectStatusSlug: "in_progress" }],
      issueTypes: [{ jiraIssueTypeId: "2", projectType: "bug" }],
      priorities: [{ jiraPriorityId: "3", projectPriority: "high" }],
      tags: [
        {
          source: { kind: "component", value: "Payments" },
          destinationTagName: "component:payments"
        }
      ],
      activeFutureSprintChoices: [{ jiraIssueId: "100", jiraSprintId: null }],
      restrictedContent: { policy: "exclude" },
      skippedAttachmentIds: ["200"],
      attachmentSkipsAccepted: true
    })

    expect(configuration.destination.key).toBe("APP")
    expect(configuration.tags[0]?.destinationTagName).toBe("component:payments")
  })

  it("keeps legacy status mappings and accepts explicit status creation", () => {
    const legacy = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
      destination: { name: "Application", slug: "application", key: "APP" },
      identities: [],
      statuses: [{ jiraStatusId: "1", projectStatusSlug: "in_progress" }],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { policy: "exclude" },
      skippedAttachmentIds: [],
      attachmentSkipsAccepted: false
    })
    const created = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
      ...legacy,
      statuses: [
        {
          jiraStatusId: "2",
          projectStatusSlug: "ready_for_review",
          createStatus: true
        }
      ]
    })

    expect(legacy.statuses[0]).not.toHaveProperty("createStatus")
    expect(created.statuses[0]?.createStatus).toBe(true)
  })

  it("decodes display-ready existing and creatable status metadata", () => {
    const requirements = Schema.decodeUnknownSync(JiraMigrationRequirements)({
      destination: {
        suggestedName: "Application",
        suggestedSlug: "application",
        suggestedKey: "APP"
      },
      identities: [],
      identityOptions: [],
      statuses: [
        {
          jiraStatusId: "2",
          name: "Ready for review",
          categoryKey: "indeterminate",
          suggestedProjectStatusSlug: "in_progress",
          createOption: {
            slug: "ready_for_review",
            label: "Ready for review",
            icon: "CircleDot",
            color: "#3b82f6",
            isTerminal: false
          }
        }
      ],
      statusOptions: [
        {
          slug: "done",
          label: "Done",
          icon: "CircleCheck",
          color: "#22c55e",
          isTerminal: true
        }
      ],
      issueTypes: [],
      priorities: [],
      tags: [],
      activeFutureSprintChoices: [],
      restrictedContent: { issueCount: 0, commentCount: 0, worklogCount: 0 },
      attachments: []
    })

    expect(requirements.statuses[0]?.createOption?.slug).toBe(
      "ready_for_review"
    )
    expect(requirements.statusOptions[0]?.icon).toBe("CircleCheck")
  })

  it("allows only the reserved component namespace in tag names", () => {
    expect(
      Schema.decodeUnknownSync(TagName)("component:payments-platform")
    ).toBe("component:payments-platform")
    expect(() => Schema.decodeUnknownSync(TagName)("team:payments")).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(TagName)("component:payments-platform-long")
    ).toThrow()
  })
})
