import { describe, expect, it } from "vite-plus/test"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { buildJiraScanArtifacts } from "./Scan"
import { Schema } from "effect"
import { JiraClient } from "./Client"
import { JiraMigrationArtifacts } from "./MigrationArtifacts"
import {
  JiraScanPageResult,
  makeScanPageActivity,
  scanPageActivityName
} from "./MigrationActivities"
import {
  makeScanTestLayer,
  scanContext,
  scanIssue,
  withScanTestWorkflow
} from "./ScanTestSupport"
import { scanCollection } from "./Scan"
import { response } from "./ScanTestSupport"

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
  it("records restricted worklogs so the review step can report them", async () => {
    const artifacts = await Effect.runPromise(
      buildJiraScanArtifacts({
        migrationId: "migration-2",
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
        components: [],
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
              assignee: null,
              labels: [],
              components: [],
              attachment: [],
              fixVersions: [],
              security: null,
              created: "2026-01-01T00:00:00Z",
              updated: "2026-01-02T00:00:00Z"
            }
          }
        ],
        commentsByIssue: { "issue-1": [] },
        worklogsByIssue: {
          "issue-1": [
            {
              id: "worklog-1",
              author: { accountId: "account-1", displayName: "Ada" },
              started: "2026-01-01T00:00:00Z",
              created: "2026-01-01T00:00:00Z",
              updated: "2026-01-01T00:00:00Z",
              timeSpentSeconds: 3600,
              visibility: { type: "group", value: "jira-administrators" }
            },
            {
              id: "worklog-2",
              author: { accountId: "account-1", displayName: "Ada" },
              started: "2026-01-02T00:00:00Z",
              created: "2026-01-02T00:00:00Z",
              updated: "2026-01-02T00:00:00Z",
              timeSpentSeconds: 1800
            }
          ]
        },
        sprints: [],
        identityOptions: [],
        scannedAt: DateTime.makeUnsafe("2026-09-14T20:00:00Z")
      })
    )

    expect(
      artifacts.manifest.restrictions.filter(
        ({ targetKind }) => targetKind === "worklog"
      )
    ).toMatchObject([
      {
        id: "worklog:worklog-1",
        targetKind: "worklog",
        targetId: "worklog-1",
        source: "worklog-visibility"
      }
    ])
    expect(artifacts.requirements.restrictedContent.worklogCount).toBe(1)
  })
})

describe("durable scan page", () => {
  it("stores real page bodies outside the encoded activity result with deterministic identities", async () => {
    const fixture = makeScanTestLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* JiraClient
        const artifacts = yield* JiraMigrationArtifacts
        const progress: unknown[] = []
        const input = {
          ...scanContext,
          kind: "issues" as const,
          parentId: null,
          pageOrdinal: 0,
          cursor: null,
          operationTry: 0
        }
        const activity = makeScanPageActivity(input, {
          client,
          artifacts,
          progress: (fence, page) =>
            Effect.sync(() => {
              progress.push({ fence, page })
              return true
            })
        })
        const result = yield* activity
        expect(result).toMatchObject({
          count: 1,
          nextCursor: null,
          warnings: []
        })
        expect(
          Object.keys(
            yield* Schema.encodeEffect(JiraScanPageResult)(result)
          ).toSorted()
        ).toEqual(["count", "nextCursor", "normalized", "raw", "warnings"])
        expect(
          yield* Schema.encodeEffect(
            Schema.fromJsonString(activity.successSchema)
          )(result)
        ).not.toContain("unique-raw-body-marker")
        expect(
          yield* artifacts.readJson(
            "acme",
            result.normalized,
            Schema.Array(Schema.Unknown)
          )
        ).toEqual([scanIssue(1)])
        expect(
          [...fixture.objects.values()].some((bytes) =>
            new TextDecoder().decode(bytes).includes("unique-raw-body-marker")
          )
        ).toBe(true)
        const again = yield* makeScanPageActivity(
          { ...input, operationTry: 1 },
          { client, artifacts, progress: () => Effect.succeed(true) }
        )
        expect(again.raw).toEqual(result.raw)
        expect(fixture.objects.size).toBe(2)
        expect(progress).toHaveLength(1)
        expect(activity.name).toMatch(
          /^v1\/scan\/issues\/1\/0\/[a-f0-9]{64}\/0$/
        )
        expect(scanPageActivityName({ ...input, cursorHash: "abc" })).toBe(
          "v1/scan/issues/1/0/abc/0"
        )
        expect(
          scanPageActivityName({
            ...input,
            kind: "comments",
            parentId: "123",
            cursorHash: "abc"
          })
        ).toBe("v1/scan/comments/1/123/0/abc/0")
        expect(
          scanPageActivityName({
            ...input,
            kind: "project",
            cursorHash: "abc",
            operationTry: 1
          })
        ).toBe("v1/scan/project/1/0/abc/1")
        expect(
          scanPageActivityName({
            ...input,
            kind: "identity-options",
            cursorHash: "abc",
            operationTry: 2
          })
        ).toBe("v1/scan/identity-options/1/0/abc/2")
      }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
    )
  })
})

describe("scan collection pagination", () => {
  it("rejects a cursor cycle using request history", async () => {
    const calls: (string | null)[] = []
    const result = await Effect.runPromise(
      Effect.result(
        scanCollection(
          { ...scanContext, kind: "issues", parentId: null },
          (input) => {
            calls.push(input.cursor)
            return Effect.succeed({
              raw: {
                key: "raw",
                contentType: "application/json",
                byteSize: 1,
                sha256: "hash"
              },
              normalized: {
                key: "normalized",
                contentType: "application/json",
                byteSize: 1,
                sha256: "hash"
              },
              count: 0,
              nextCursor: input.cursor === "a" ? "b" : "a",
              warnings: []
            })
          }
        )
      )
    )
    expect(result._tag).toBe("Failure")
    expect(calls).toEqual([null, "a", "b"])
  })
  it.each(["comments", "worklogs", "changelogs"] as const)(
    "keeps every %s offset page in a separate activity",
    async (kind) => {
      const fixture = makeScanTestLayer((request) => {
        const url = new URL(request.url)
        const startAt = Number(url.searchParams.get("startAt") ?? 0)
        const value =
          kind === "comments"
            ? {
                id: String(startAt),
                author: { accountId: "a", displayName: "Ada" },
                body: "body",
                created: "2026-01-01"
              }
            : kind === "worklogs"
              ? {
                  id: String(startAt),
                  author: { accountId: "a", displayName: "Ada" },
                  started: "2026-01-01",
                  created: "2026-01-01",
                  updated: "2026-01-01",
                  timeSpentSeconds: 10
                }
              : { id: String(startAt), created: "2026-01-01", items: [] }
        return Effect.succeed(
          response({
            [kind === "changelogs" ? "values" : kind]: [value],
            startAt,
            maxResults: 1,
            total: 3,
            isLast: startAt === 2
          })
        )
      })
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* JiraClient
          const artifacts = yield* JiraMigrationArtifacts
          const pages = yield* scanCollection(
            { ...scanContext, kind, parentId: "1" },
            (input) =>
              makeScanPageActivity(input, {
                client,
                artifacts,
                progress: () => Effect.succeed(true)
              })
          )
          expect(pages).toHaveLength(3)
          expect(pages.map((page) => page.count)).toEqual([1, 1, 1])
          expect(new Set(pages.map((page) => page.normalized.key)).size).toBe(3)
          expect(
            fixture.requests.map((request) =>
              new URL(request.url).searchParams.get("startAt")
            )
          ).toEqual(["0", "1", "2"])
        }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
      )
    }
  )
})

it("sorts normalized stable IDs while preserving the original response JSON", async () => {
  const raw = {
    issues: [
      { ...scanIssue(2), unknownNested: "provenance-nested" },
      scanIssue(1)
    ],
    unknownEnvelope: "provenance-envelope"
  }
  const fixture = makeScanTestLayer(() => Effect.succeed(response(raw)))
  await Effect.runPromise(
    Effect.gen(function* () {
      const artifacts = yield* JiraMigrationArtifacts
      const page = yield* makeScanPageActivity(
        {
          ...scanContext,
          kind: "issues",
          parentId: null,
          cursor: null,
          pageOrdinal: 0,
          operationTry: 0
        },
        {
          client: yield* JiraClient,
          artifacts,
          progress: () => Effect.succeed(true)
        }
      )
      expect(
        yield* artifacts.readJson("acme", page.raw, Schema.Unknown)
      ).toEqual(raw)
      expect(
        yield* artifacts.readJson(
          "acme",
          page.normalized,
          Schema.Array(Schema.Unknown)
        )
      ).toEqual([scanIssue(1), scanIssue(2)])
    }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
  )
})

import { makeBuildManifestActivity } from "./MigrationActivities"

it("blocks configuration when a raw artifact referenced by a completed page has disappeared", async () => {
  const fixture = makeScanTestLayer()
  await Effect.runPromise(
    Effect.gen(function* () {
      const artifacts = yield* JiraMigrationArtifacts
      const client = yield* JiraClient
      const page = yield* makeScanPageActivity(
        {
          ...scanContext,
          kind: "issues",
          parentId: null,
          cursor: null,
          pageOrdinal: 0,
          operationTry: 0
        },
        { client, artifacts, progress: () => Effect.succeed(true) }
      )
      fixture.objects.delete(`tenant/${page.raw.key}`)
      const result = yield* Effect.result(
        makeBuildManifestActivity(
          scanContext,
          [
            {
              kind: "issues",
              parentId: null,
              raw: page.raw,
              normalized: page.normalized,
              warnings: []
            }
          ],
          yield* artifacts.writeJson(
            scanContext.orgSlug,
            {
              migrationId: scanContext.migrationId,
              scanRevision: scanContext.scanRevision,
              area: "normalized",
              kind: "identity-options",
              identity: "snapshot"
            },
            []
          ),
          {
            client,
            artifacts,
            progress: () => Effect.succeed(true),
            recordFailure: () => Effect.die("unused"),
            resume: () => Effect.die("unused"),
            identityOptions: Effect.succeed([]),
            configured: () => Effect.die("must not configure")
          },
          0
        )
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "JiraScanFailure",
          reason: "jira_migration_storage_failed",
          retryable: true
        }
      })
    }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
  )
})
