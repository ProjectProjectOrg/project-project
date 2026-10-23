import { it } from "@effect/vitest"
import { JiraClient } from "@pp/integration-jira/Client"
import {
  JiraScanPageResult,
  defineScanPageActivity,
  scanPageActivityName
} from "@pp/integration-jira/MigrationActivities"
import { JiraMigrationArtifacts } from "@pp/integration-jira/MigrationArtifacts"
import { buildJiraScanArtifacts } from "@pp/integration-jira/Scan"
import { scanCollection } from "@pp/integration-jira/Scan"
import { Schema } from "effect"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import { describe, expect } from "vitest"

import {
  makeScanTestLayer,
  scanContext,
  scanIssue,
  withScanTestWorkflow
} from "./ScanTestSupport"
import { response } from "./ScanTestSupport"

describe("buildJiraScanArtifacts", () => {
  it.effect("builds a versioned manifest and display-ready requirements", () =>
    Effect.gen(function* () {
      const artifacts = yield* buildJiraScanArtifacts({
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
  )
  it.effect(
    "records restricted worklogs so the review step can report them",
    () =>
      Effect.gen(function* () {
        const artifacts = yield* buildJiraScanArtifacts({
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
  )
})

describe("durable scan page", () => {
  it.effect(
    "stores real page bodies outside the encoded activity result with deterministic identities",
    () =>
      Effect.gen(function* () {
        const fixture = makeScanTestLayer()
        yield* Effect.gen(function* () {
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
          const activity = defineScanPageActivity(input, {
            client,
            artifacts,
            progress: (fence, page) =>
              Effect.sync(() => {
                progress.push({ fence, page })
                return true
              })
          })
          const encodeResult = Schema.encodeEffect(
            Schema.fromJsonString(activity.successSchema)
          )
          const result = yield* activity
          expect(result).toMatchObject({
            count: 1,
            nextCursor: null,
            warnings: []
          })
          expect(
            Object.keys(yield* encodeJiraScanPageResult(result)).toSorted()
          ).toEqual(["count", "nextCursor", "normalized", "raw", "warnings"])
          expect(yield* encodeResult(result)).not.toContain(
            "unique-raw-body-marker"
          )
          expect(
            yield* artifacts.readJson(
              "acme",
              result.normalized,
              decodeUnknownArray
            )
          ).toEqual([scanIssue(1)])
          expect(
            [...fixture.objects.values()].some((bytes) =>
              new TextDecoder().decode(bytes).includes("unique-raw-body-marker")
            )
          ).toBe(true)
          const again = yield* defineScanPageActivity(
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
      })
  )
})

describe("scan collection pagination", () => {
  it.effect("rejects a cursor cycle using request history", () =>
    Effect.gen(function* () {
      const calls: (string | null)[] = []
      const result = yield* Effect.result(
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
      expect(result._tag).toBe("Failure")
      expect(calls).toEqual([null, "a", "b"])
    })
  )
  it.effect.each(["comments", "worklogs", "changelogs"] as const)(
    "keeps every %s offset page in a separate activity",
    (kind) =>
      Effect.gen(function* () {
        const fixture = makeScanTestLayer((request) => {
          const url = new URL(request.url)
          const startAt = Number(url.searchParams.get("startAt") ?? 0)
          const value = Match.value(kind).pipe(
            Match.when("comments", () => ({
              id: String(startAt),
              author: { accountId: "a", displayName: "Ada" },
              body: "body",
              created: "2026-01-01"
            })),
            Match.when("worklogs", () => ({
              id: String(startAt),
              author: { accountId: "a", displayName: "Ada" },
              started: "2026-01-01",
              created: "2026-01-01",
              updated: "2026-01-01",
              timeSpentSeconds: 10
            })),
            Match.orElse(() => ({
              id: String(startAt),
              created: "2026-01-01",
              items: []
            }))
          )
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
        yield* Effect.gen(function* () {
          const client = yield* JiraClient
          const artifacts = yield* JiraMigrationArtifacts
          const pages = yield* scanCollection(
            { ...scanContext, kind, parentId: "1" },
            (input) =>
              defineScanPageActivity(input, {
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
      })
  )
})

it.effect(
  "sorts normalized stable IDs while preserving the original response JSON",
  () =>
    Effect.gen(function* () {
      const raw = {
        issues: [
          { ...scanIssue(2), unknownNested: "provenance-nested" },
          scanIssue(1)
        ],
        unknownEnvelope: "provenance-envelope"
      }
      const fixture = makeScanTestLayer(() => Effect.succeed(response(raw)))
      yield* Effect.gen(function* () {
        const artifacts = yield* JiraMigrationArtifacts
        const page = yield* defineScanPageActivity(
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
          yield* artifacts.readJson("acme", page.raw, decodeUnknown)
        ).toEqual(raw)
        expect(
          yield* artifacts.readJson("acme", page.normalized, decodeUnknownArray)
        ).toEqual([scanIssue(1), scanIssue(2)])
      }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
    })
)

import { defineBuildManifestActivity } from "@pp/integration-jira/MigrationActivities"

it.effect(
  "blocks configuration when a raw artifact referenced by a completed page has disappeared",
  () =>
    Effect.gen(function* () {
      const fixture = makeScanTestLayer()
      yield* Effect.gen(function* () {
        const artifacts = yield* JiraMigrationArtifacts
        const client = yield* JiraClient
        const page = yield* defineScanPageActivity(
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
          defineBuildManifestActivity(
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
    })
)

import {
  buildScanManifestV2,
  prepareScanV2,
  type ScanChunk
} from "@pp/integration-jira/ScanV2"

import { scanUser } from "./ScanTestSupport"

const decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(Schema.Json))

const decodeUnknown = Schema.decodeUnknownEffect(Schema.Unknown)

const encodeJiraScanPageResult = Schema.encodeEffect(JiraScanPageResult)

const relationshipArtifact = (key: string) => ({
  key,
  contentType: "application/json",
  byteSize: 2,
  sha256: "a".repeat(64)
})

it.effect("keeps ordinary epic children out of subtask relationships", () =>
  Effect.gen(function* () {
    const values: ReadonlyArray<Pick<ScanChunk, "kind" | "values">> = [
      { kind: "account", values: [scanUser] },
      { kind: "project", values: [{ id: "10000", key: "APP", name: "App" }] },
      {
        kind: "statuses",
        values: [
          {
            id: "epic",
            name: "Epic",
            subtask: false,
            statuses: [{ id: "s1", name: "Todo" }]
          },
          {
            id: "story",
            name: "Story",
            subtask: false,
            statuses: [{ id: "s1", name: "Todo" }]
          },
          {
            id: "subtask",
            name: "Subtask",
            subtask: true,
            statuses: [{ id: "s1", name: "Todo" }]
          }
        ]
      },
      {
        kind: "issues",
        values: [1, 2, 3].map((id) => ({
          id: String(id),
          key: `APP-${id}`,
          fields: {
            ...scanIssue(id).fields,
            priority: null,
            components: [],
            issuetype: {
              id: Match.value(id).pipe(
                Match.when(1, () => "epic"),
                Match.when(2, () => "story"),
                Match.orElse(() => "subtask")
              )
            },
            parent: id > 1 ? { id: String(id - 1) } : null
          }
        }))
      }
    ]
    const chunks = values.map((value) => ({
      kind: value.kind,
      values: value.values,
      parentId: null,
      warnings: [],
      raw: relationshipArtifact(`raw/${value.kind}`),
      normalized: relationshipArtifact(`normalized/${value.kind}`)
    }))
    const prepared = yield* prepareScanV2(scanContext, chunks, [])
    const refs = new Map(
      prepared.documents.map((document) => [
        `${document.kind}:${document.id}`,
        relationshipArtifact(`${document.kind}/${document.id}`)
      ])
    )
    const manifest = yield* buildScanManifestV2(prepared, refs)
    expect(manifest.parentsSubtasks).toEqual([
      { id: "3", parentIssueId: "2", subtaskIssueId: "3" }
    ])
    expect(manifest.epics).toEqual([
      { id: "1", key: "APP-1", name: "Issue 1", issueIds: ["2"] }
    ])
  })
)

it.effect(
  "normalizes recoverable issue fields while retaining source JSON and reporting warnings",
  () =>
    Effect.gen(function* () {
      const source = {
        issues: [
          {
            ...scanIssue(1),
            fields: {
              ...scanIssue(1).fields,
              summary: 42,
              labels: ["backend", 42, "urgent", null],
              attachment: [
                {
                  id: "a1",
                  filename: "image.png",
                  mimeType: "image/png",
                  size: "unavailable"
                }
              ],
              customfield_example: { nested: [1, "kept"] }
            }
          }
        ],
        isLast: true
      }
      const fixture = makeScanTestLayer(() => Effect.succeed(response(source)))
      yield* Effect.gen(function* () {
        const artifacts = yield* JiraMigrationArtifacts
        const client = yield* JiraClient
        const page = yield* defineScanPageActivity(
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
        expect(
          yield* artifacts.readJson("acme", page.raw, decodeUnknown)
        ).toEqual(source)
        const values = yield* artifacts.readJson(
          "acme",
          page.normalized,
          decodeUnknownArray
        )
        expect(values[0]).toMatchObject({
          fields: {
            labels: ["backend", "urgent"],
            customfield_example: { nested: [1, "kept"] }
          }
        })
        const base = {
          parentId: null,
          warnings: [],
          raw: page.raw,
          normalized: page.normalized
        }
        const rawChunks: ReadonlyArray<ScanChunk> = [
          { ...base, kind: "account", values: [scanUser] },
          {
            ...base,
            kind: "project",
            values: [{ id: "10000", key: "APP", name: "Application" }]
          },
          {
            ...base,
            kind: "statuses",
            values: [
              { id: "t1", name: "Task", statuses: [{ id: "s1", name: "Todo" }] }
            ]
          },
          { ...base, kind: "priorities", values: [{ id: "p1", name: "High" }] },
          { ...base, kind: "components", values: [{ id: "c1", name: "Core" }] },
          {
            ...base,
            kind: "fields",
            values: [
              {
                id: "customfield_example",
                name: "Example",
                custom: true,
                schema: { type: 42, custom: "example-plugin" }
              }
            ]
          },
          { ...base, kind: "issues", values }
        ]
        const chunks = rawChunks.map((chunk) =>
          Object.assign({}, chunk, {
            raw:
              chunk.kind === "issues"
                ? page.raw
                : relationshipArtifact(`raw/${chunk.kind}`),
            normalized:
              chunk.kind === "issues"
                ? page.normalized
                : relationshipArtifact(`normalized/${chunk.kind}`)
          })
        )
        const prepared = yield* prepareScanV2(scanContext, chunks, [])
        const manifest = yield* buildScanManifestV2(
          prepared,
          new Map(
            prepared.documents.map((document) => [
              `${document.kind}:${document.id}`,
              relationshipArtifact(`converted/${document.kind}/${document.id}`)
            ])
          )
        )
        expect(manifest.issues[0]).toMatchObject({
          key: "APP-1",
          summary: "APP-1",
          labelIds: ["backend", "urgent"]
        })
        expect(manifest.warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              category: "issues",
              message: expect.stringContaining('["summary"]')
            }),
            expect.objectContaining({
              category: "issues",
              message: expect.stringContaining('["labels",1]')
            }),
            expect.objectContaining({
              category: "issues",
              message: expect.stringContaining('["attachment",0,"size"]')
            }),
            expect.objectContaining({
              category: "fields",
              message: expect.stringContaining('["type"]')
            })
          ])
        )
        expect(manifest.coverage).toContainEqual(
          expect.objectContaining({ category: "issues", visibility: "partial" })
        )
        expect(manifest.attachments[0]).toMatchObject({ id: "a1", byteSize: 0 })
        expect(manifest.fieldDefinitions[0]).toMatchObject({
          id: "customfield_example",
          type: "unknown"
        })
        expect(manifest.productApps).toContainEqual(
          expect.objectContaining({ id: "example-plugin", detected: true })
        )
      }).pipe(withScanTestWorkflow, Effect.provide(fixture.layer))
    })
)

it.effect(
  "rejects an unusable issue identity instead of inventing a destination",
  () =>
    Effect.gen(function* () {
      const fixture = makeScanTestLayer(() =>
        Effect.succeed(
          response({
            issues: [{ ...scanIssue(1), id: "" }],
            isLast: true
          })
        )
      )
      const result = yield* Effect.gen(function* () {
        const client = yield* JiraClient
        return yield* Effect.result(
          client.searchIssuesPage({
            userId: "user-1",
            cloudId: "cloud-1",
            jql: 'project = "APP"',
            fields: ["*all"]
          })
        )
      }).pipe(Effect.provide(fixture.layer))
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "JiraError", reason: "invalid_response" }
      })
    })
)
