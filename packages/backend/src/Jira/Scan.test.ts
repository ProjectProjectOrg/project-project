import { describe, expect, it } from "vite-plus/test"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { buildJiraScanArtifacts } from "./Scan"

describe("buildJiraScanArtifacts", () => {
  it("builds a versioned manifest and display-ready requirements", async () => {
    const artifacts = await Effect.runPromise(
      buildJiraScanArtifacts({
        migrationId: "migration-1",
        cloudId: "cloud-1",
        siteName: "Example",
        siteUrl: "https://example.atlassian.net",
        project: {
          id: "10000",
          key: "APP",
          name: "Application",
          projectTypeKey: "software"
        },
        statuses: [
          {
            id: "type-1",
            name: "Bug",
            subtask: false,
            statuses: [
              {
                id: "status-1",
                name: "In Progress",
                statusCategory: { key: "indeterminate" }
              }
            ]
          }
        ],
        priorities: [{ id: "priority-1", name: "Highest" }],
        components: [{ id: "component-1", name: "Payments" }],
        versions: [],
        issues: [
          {
            id: "issue-1",
            key: "APP-7",
            fields: {
              summary: "Fix checkout",
              description: null,
              status: { id: "status-1" },
              issuetype: { id: "type-1" },
              priority: { id: "priority-1" },
              assignee: {
                accountId: "account-1",
                displayName: "Ada",
                emailAddress: "ada@example.test"
              },
              labels: ["backend"],
              components: [{ id: "component-1" }],
              attachment: [],
              fixVersions: [],
              security: null,
              created: "2026-01-01T00:00:00Z",
              updated: "2026-01-02T00:00:00Z"
            }
          }
        ],
        commentsByIssue: { "issue-1": [] },
        worklogsByIssue: { "issue-1": [] },
        sprints: [],
        identityOptions: [
          {
            id: "user-1",
            name: "",
            email: "ada@example.test",
            imageUrl: null
          }
        ],
        scannedAt: DateTime.makeUnsafe("2026-09-14T20:00:00Z")
      })
    )

    expect(artifacts.manifest).toMatchObject({
      version: 1,
      migrationId: "migration-1",
      issues: [{ id: "issue-1", key: "APP-7", issueNumber: 7 }]
    })
    expect(artifacts.requirements).toMatchObject({
      destination: { suggestedSlug: "application", suggestedKey: "APP" },
      identities: [
        {
          jiraAccountId: "account-1",
          suggestedProjectProjectUserId: "user-1"
        }
      ],
      statuses: [
        {
          suggestedProjectStatusSlug: "in_progress",
          createOption: {
            slug: "in_progress_eb9ac9db",
            label: "In Progress",
            icon: "CircleDot",
            isTerminal: false
          }
        }
      ]
    })
    expect(artifacts.requirements.statusOptions).toEqual([
      {
        slug: "todo",
        label: "Todo",
        icon: "CircleDashed",
        color: "#a3a3a3",
        isTerminal: false
      },
      {
        slug: "in_progress",
        label: "In progress",
        icon: "CircleDot",
        color: "#3b82f6",
        isTerminal: false
      },
      {
        slug: "done",
        label: "Done",
        icon: "CircleCheck",
        color: "#22c55e",
        isTerminal: true
      }
    ])
    expect(artifacts.requirements.identityOptions).toEqual([
      {
        id: "user-1",
        name: "ada@example.test",
        email: "ada@example.test",
        imageUrl: null
      }
    ])
    expect(
      artifacts.requirements.tags.map(
        ({ suggestedDestinationTagName }) => suggestedDestinationTagName
      )
    ).toEqual(["component:payments", "backend"])
  })
})
