import { it } from "@effect/vitest"
import { describe, expect } from "vite-plus/test"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { DurableDeferred, WorkflowEngine } from "effect/unstable/workflow"
import {
  JIRA_DOCUMENT_BATCH_SIZE,
  jiraCopyAttachmentActivityName,
  jiraCreateHiddenActivityName,
  jiraDocumentBatches,
  jiraFinalizePlanActivityName,
  jiraPreflightActivityName,
  jiraPublicationActivityName,
  jiraWriteDocumentsActivityName,
  materializeJiraPreparedPublication,
  publishJiraPreparedPublication,
  defineFinalizeMigrationActivity,
  defineStartMigrationActivity
} from "./MigrationActivities"
import {
  JiraMigrationWorkflow,
  JiraMigrationWorkflowFailure,
  JiraMigrationWorkflowPayload,
  JiraMigrationWorkflowSuccess,
  RetrySignal,
  StartImportSignal,
  activityName,
  makeJiraMigrationWorkflow,
  retryDeferred,
  retryDeferredName,
  startImportDeferred,
  startImportDeferredName
} from "./MigrationWorkflow"
import { JiraClient } from "./Client"
import { JiraMigrationArtifacts } from "./MigrationArtifacts"
import { JiraMigrationManifestV2 } from "./Manifest"
import { scanSnapshot } from "./MigrationWorkflow"
import {
  makeScanTestLayer,
  response,
  scanContext,
  scanFixtureResponse,
  scanIssue
} from "./ScanTestSupport"
import { Clock, Deferred } from "effect"
import * as TestClock from "effect/testing/TestClock"
import type { JiraArtifactRef } from "./MigrationArtifacts"
import { scanUser } from "./ScanTestSupport"

const offsetPage = (values: unknown[]) => ({
  values,
  startAt: 0,
  maxResults: 100,
  total: values.length,
  isLast: true
})

const requestCursor = (body: unknown) =>
  Schema.decodeUnknownOption(
    Schema.Struct({ nextPageToken: Schema.optional(Schema.String) })
  )(body).pipe(
    Option.flatMap((value) => Option.fromUndefinedOr(value.nextPageToken)),
    Option.getOrUndefined
  )

const createPayload = {
  command: {
    _tag: "Create" as const,
    organizationId: "organization-1",
    userId: "user-1",
    requestId: "request-1",
    source: {
      cloudId: "cloud-1",
      siteName: "Example Jira",
      siteUrl: "https://example.atlassian.net",
      projectId: "project-1",
      projectKey: "WEB",
      projectName: "Website"
    }
  }
}

const rescanPayload = {
  command: {
    _tag: "Rescan" as const,
    supersededExecutionId: "previous-execution",
    migrationId: "migration-1",
    expectedRevision: 4,
    workflowAttempt: 2,
    scanRevision: 5
  }
}

const readyPublication = {
  projectId: "project-1",
  planRef: {
    key: "migrations/jira/migration-1/publication/plan.json",
    contentType: "application/json",
    byteSize: 1,
    sha256: "a".repeat(64)
  },
  verified: {
    planSha256: "a".repeat(64),
    documentCount: 0,
    attachmentCount: 0,
    unresolvedReferenceCount: 0 as const
  }
}

const waitUntilSuspended = (executionId: string) =>
  Effect.gen(function* () {
    while (true) {
      const result = yield* JiraMigrationWorkflow.poll(executionId)
      if (Option.isSome(result) && result.value._tag === "Suspended")
        return undefined
      if (Option.isSome(result) && result.value._tag === "Complete")
        return yield* Effect.die("Workflow completed before suspension")
      yield* Effect.yieldNow
    }
  })

const completeStartImport = (executionId: string, scanRevision: number) => {
  const deferred = startImportDeferred(scanRevision)
  return DurableDeferred.succeed(deferred, {
    token: DurableDeferred.tokenFromExecutionId(deferred, {
      workflow: JiraMigrationWorkflow,
      executionId
    }),
    value: { scanRevision }
  })
}

describe("Jira migration workflow contracts", () => {
  it.effect(
    "runs bounded materialization stages through stable Activities",
    () =>
      Effect.gen(function* () {
        const stages = yield* Ref.make<ReadonlyArray<string>>([])
        const record = (stage: string) =>
          Ref.update(stages, (items) => [...items, stage])
        const planRef = {
          key: "migrations/jira/migration-1/publication/plan.json",
          contentType: "application/json",
          byteSize: 10,
          sha256: "a".repeat(64)
        }
        const layer = makeJiraMigrationWorkflow({
          start: () => Effect.void,
          scan: () => Effect.void,
          finalize: () => Effect.void,
          materialize: () =>
            materializeJiraPreparedPublication(
              {
                scanRevision: 1,
                configurationRevision: 2,
                attachments: [{ sourceAttachmentId: "attachment-1" }]
              },
              {
                error: JiraMigrationWorkflowFailure,
                createHidden: record("hidden").pipe(Effect.as("project-1")),
                copyAttachment: (attachment) =>
                  record(`attachment-${attachment.sourceAttachmentId}`).pipe(
                    Effect.as({
                      sourceAttachmentId: attachment.sourceAttachmentId,
                      kind: "skipped" as const
                    })
                  ),
                finalizePlan: () =>
                  record("plan").pipe(
                    Effect.as({
                      planRef,
                      publicationRevision: "b".repeat(64),
                      documentBatchCount: 2
                    })
                  ),
                writeDocumentBatch: (_planRef, ordinal) =>
                  record(`batch-${ordinal}`).pipe(Effect.as(32)),
                writeArchive: () => record("archive").pipe(Effect.as(1)),
                writeReport: () => record("report").pipe(Effect.as(1)),
                verify: () =>
                  record("verify").pipe(
                    Effect.as({
                      planSha256: "b".repeat(64),
                      documentCount: 66,
                      attachmentCount: 0,
                      unresolvedReferenceCount: 0 as const
                    })
                  )
              }
            ),
          publish: (_input, ready) =>
            publishJiraPreparedPublication(ready, {
              error: JiraMigrationWorkflowFailure,
              publish: () => record("publish").pipe(Effect.as(true))
            }).pipe(Effect.asVoid)
        }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        yield* Effect.gen(function* () {
          const executionId = yield* JiraMigrationWorkflow.execute(
            createPayload,
            {
              discard: true
            }
          )
          yield* waitUntilSuspended(executionId)
          yield* completeStartImport(executionId, 1)
          yield* JiraMigrationWorkflow.execute(createPayload)
          expect(yield* Ref.get(stages)).toEqual([
            "hidden",
            "attachment-attachment-1",
            "plan",
            "batch-0",
            "batch-1",
            "archive",
            "report",
            "verify",
            "publish"
          ])
        }).pipe(Effect.provide(layer))
      })
  )
  it("keeps import Activity names and sorted document batches stable", () => {
    const documents = Array.from({ length: 65 }, (_, index) => ({
      path: `tickets/APP-${String(index + 1).padStart(3, "0")}.md`
    }))
    const paths = jiraDocumentBatches(documents.toReversed()).map((batch) =>
      batch.map(({ path }) => path)
    )

    expect(JIRA_DOCUMENT_BATCH_SIZE).toBe(32)
    expect(paths.map((batch) => batch.length)).toEqual([32, 32, 1])
    expect(paths.flat()).toEqual(documents.map(({ path }) => path))
    expect(jiraDocumentBatches(documents)).toEqual(
      jiraDocumentBatches(documents.toReversed())
    )
    expect(() =>
      jiraDocumentBatches([{ path: "duplicate" }, { path: "duplicate" }])
    ).toThrow("Duplicate Jira publication document path")
    expect(jiraPreflightActivityName(3, 7, 2)).toBe("v1/import/preflight/3/7/2")
    expect(jiraCreateHiddenActivityName(3, 7, 2)).toBe(
      "v1/import/create-hidden/3/7/2"
    )
    expect(jiraFinalizePlanActivityName(3, 7, "abc", 2)).toBe(
      "v1/import/finalize-plan/3/7/abc/2"
    )
    expect(jiraCopyAttachmentActivityName("attachment/1", 2)).toBe(
      "v1/import/attachment/attachment%2F1/2"
    )
    expect(jiraWriteDocumentsActivityName("revision", 1, 2)).toBe(
      "v1/import/write-documents/revision/batch/1/2"
    )
    expect(jiraPublicationActivityName("verify", "revision", 2)).toBe(
      "v1/import/verify/revision/2"
    )
  })

  it("keeps persisted names and idempotency keys stable", () => {
    expect(JiraMigrationWorkflow._tag).toBe("ProjectProject/JiraMigration/v1")
    expect(JiraMigrationWorkflow.idempotencyKey(createPayload)).toBe(
      "create:organization-1:user-1:request-1"
    )
    expect(JiraMigrationWorkflow.idempotencyKey(rescanPayload)).toBe(
      "migration-1:2:4"
    )
    expect(activityName(["start"])).toBe("v1/start")
    expect(
      defineStartMigrationActivity(Effect.void, JiraMigrationWorkflowFailure)
        .name
    ).toBe("v1/start")
    expect(defineFinalizeMigrationActivity(Effect.void).name).toBe(
      "v1/finalize"
    )
    expect(startImportDeferredName(5)).toBe("StartImport/v1/5")
    expect(startImportDeferred(5).name).toBe("StartImport/v1/5")
    expect(retryDeferredName(1)).toBe("Retry/v1/1")
    expect(retryDeferredName(2)).toBe("Retry/v1/2")
    expect(retryDeferred(2).name).toBe("Retry/v1/2")
  })

  it("round trips persisted payload, success, and failure values", () => {
    const createPayloadEncoded = Schema.encodeSync(
      JiraMigrationWorkflowPayload
    )(createPayload)
    const payloadEncoded = Schema.encodeSync(JiraMigrationWorkflowPayload)(
      rescanPayload
    )
    const success = { migrationId: "migration-1" }
    const successEncoded = Schema.encodeSync(JiraMigrationWorkflowSuccess)(
      success
    )
    const failure = {
      _tag: "JiraMigrationWorkflowFailure" as const,
      reason: "jira_unavailable",
      retryable: true
    }
    const failureEncoded = Schema.encodeSync(JiraMigrationWorkflowFailure)(
      failure
    )
    const startImportSignal = { scanRevision: 5 }
    const retrySignal = { failureSequence: 3 }

    expect(
      Schema.decodeSync(JiraMigrationWorkflowPayload)(createPayloadEncoded)
    ).toEqual(createPayload)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowPayload)(payloadEncoded)
    ).toEqual(rescanPayload)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowSuccess)(successEncoded)
    ).toEqual(success)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowFailure)(failureEncoded)
    ).toEqual(failure)
    expect(
      Schema.decodeSync(StartImportSignal)(
        Schema.encodeSync(StartImportSignal)(startImportSignal)
      )
    ).toEqual(startImportSignal)
    expect(
      Schema.decodeSync(RetrySignal)(
        Schema.encodeSync(RetrySignal)(retrySignal)
      )
    ).toEqual(retrySignal)
  })

  it.effect("replays a completed activity without repeating its effect", () =>
    Effect.gen(function* () {
      const startCalls = yield* Ref.make(0)
      const finalizeCalls = yield* Ref.make(0)
      const layer = makeJiraMigrationWorkflow({
        materialize: () => Effect.succeed(readyPublication),
        publish: () => Effect.void,
        scan: () => Effect.void,
        start: () => Ref.update(startCalls, (count) => count + 1),
        finalize: () => Ref.update(finalizeCalls, (count) => count + 1)
      }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function* () {
        const executionId = yield* JiraMigrationWorkflow.execute(
          rescanPayload,
          { discard: true }
        )
        yield* waitUntilSuspended(executionId)

        expect(yield* Ref.get(startCalls)).toBe(1)

        yield* JiraMigrationWorkflow.resume(executionId)
        yield* waitUntilSuspended(executionId)

        expect(yield* Ref.get(startCalls)).toBe(1)

        yield* completeStartImport(executionId, 5)
        const result = yield* JiraMigrationWorkflow.execute(rescanPayload)

        expect(result).toEqual({ migrationId: "migration-1" })
        expect(yield* Ref.get(startCalls)).toBe(1)
        expect(yield* Ref.get(finalizeCalls)).toBe(1)
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect(
    "keeps import work alive after StartImport and interrupts its durable retry wait",
    () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const finalized = yield* Deferred.make<boolean>()
        const layer = makeJiraMigrationWorkflow({
          start: () => Effect.void,
          scan: () => Effect.void,
          materialize: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* DurableDeferred.await(retryDeferred(9))
              return readyPublication
            }),
          publish: () => Effect.void,
          finalize: ({ exit }) =>
            Deferred.succeed(finalized, Exit.isFailure(exit)).pipe(
              Effect.asVoid
            )
        }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
        yield* Effect.gen(function* () {
          const id = yield* JiraMigrationWorkflow.execute(createPayload, {
            discard: true
          })
          yield* completeStartImport(id, 1)
          yield* waitUntilSuspended(id)
          expect(yield* Deferred.isDone(entered)).toBe(true)
          expect(yield* Deferred.isDone(finalized)).toBe(false)
          yield* JiraMigrationWorkflow.interrupt(id)
          expect(yield* Deferred.await(finalized)).toBe(true)
        }).pipe(Effect.provide(layer))
      })
  )

  it.effect("uses the initial scan revision and execution id for create", () =>
    Effect.gen(function* () {
      const layer = makeJiraMigrationWorkflow({
        materialize: () => Effect.succeed(readyPublication),
        publish: () => Effect.void,
        scan: () => Effect.void,
        start: () => Effect.void,
        finalize: () => Effect.void
      }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function* () {
        const executionId = yield* JiraMigrationWorkflow.execute(
          createPayload,
          { discard: true }
        )
        yield* completeStartImport(executionId, 1)

        expect(yield* JiraMigrationWorkflow.execute(createPayload)).toEqual({
          migrationId: executionId
        })
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect(
    "captures activity defects with the default workflow behavior",
    () =>
      Effect.gen(function* () {
        const layer = makeJiraMigrationWorkflow({
          materialize: () => Effect.succeed(readyPublication),
          publish: () => Effect.void,
          scan: () => Effect.void,
          start: () => Effect.die("start defect"),
          finalize: () => Effect.void
        }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

        const exit = yield* JiraMigrationWorkflow.execute(createPayload).pipe(
          Effect.exit,
          Effect.provide(layer)
        )

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(true)
        }
      })
  )
})

describe("durable snapshot workflow", () => {
  it.effect(
    "resumes completed issue pages once and pauses only after writing the validated manifest",
    () => {
      let blocked = true
      let configured = 0
      let sequence = 0
      let manifestKey = ""
      const fixture = makeScanTestLayer((request) => {
        if (request.url.endsWith("/search/jql")) {
          const token = requestCursor(request.body)
          if (token === "page-3" && blocked)
            return Effect.succeed(response({}, 401))
          return Effect.succeed(
            response({
              issues: [
                scanIssue(token === "page-3" ? 3 : token === "page-2" ? 2 : 1)
              ],
              nextPageToken:
                token === "page-3"
                  ? undefined
                  : token === "page-2"
                    ? "page-3"
                    : "page-2",
              isLast: token === "page-3"
            })
          )
        }
        return Effect.succeed(scanFixtureResponse(request))
      })
      const layer = makeJiraMigrationWorkflow({
        materialize: () => Effect.succeed(readyPublication),
        publish: () => Effect.void,
        start: () => Effect.void,
        scan: () =>
          Effect.gen(function* () {
            const client = yield* JiraClient
            const artifacts = yield* JiraMigrationArtifacts
            const result = yield* scanSnapshot(scanContext, {
              client,
              artifacts,
              progress: () => Effect.succeed(true),
              recordFailure: () => Effect.sync(() => ++sequence),
              resume: () => Effect.succeed({ _tag: "Resumed" }),
              identityOptions: Effect.succeed([]),
              configured: (_fence, result) =>
                Effect.sync(() => {
                  configured++
                  manifestKey = result.manifest.key
                  return true
                })
            })
            const manifest = yield* artifacts
              .readJson("acme", result.manifest, JiraMigrationManifestV2)
              .pipe(Effect.orDie)
            expect(manifest.issues.map((issue) => issue.id)).toEqual([
              "1",
              "2",
              "3"
            ])
            expect(manifest.watchers).toHaveLength(3)
            expect(manifest.votes).toHaveLength(3)
          }),
        finalize: () => Effect.void
      }).pipe(
        Layer.provide(fixture.layer),
        Layer.provideMerge(WorkflowEngine.layerMemory)
      )
      return Effect.gen(function* () {
        const id = yield* JiraMigrationWorkflow.execute(createPayload, {
          discard: true
        })
        yield* waitUntilSuspended(id)
        expect(sequence).toBe(1)
        expect(configured).toBe(0)
        yield* JiraMigrationWorkflow.resume(id)
        yield* waitUntilSuspended(id)
        expect(sequence).toBe(1)
        blocked = false
        const deferred = retryDeferred(1)
        yield* DurableDeferred.succeed(deferred, {
          token: DurableDeferred.tokenFromExecutionId(deferred, {
            workflow: JiraMigrationWorkflow,
            executionId: id
          }),
          value: { failureSequence: 1 }
        })
        yield* waitUntilSuspended(id)
        expect(configured).toBe(1)
        expect(manifestKey).toContain("scan-1/manifest")
        expect(
          fixture.requests.filter(
            (request) =>
              request.url.endsWith("/search/jql") &&
              requestCursor(request.body) === "page-2"
          )
        ).toHaveLength(1)
        yield* completeStartImport(id, 1)
        expect(yield* JiraMigrationWorkflow.execute(createPayload)).toEqual({
          migrationId: id
        })
      }).pipe(Effect.provide(layer))
    }
  )
})

const snapshotHarness = (
  fixture: ReturnType<typeof makeScanTestLayer>,
  identityOptions: import("./MigrationActivities").ScanSnapshotDependencies["identityOptions"] = Effect.succeed(
    []
  ),
  hooks: {
    readonly recorded: (sequence: number) => Effect.Effect<void>
    readonly beforeResume: (sequence: number) => Effect.Effect<void>
  } = { recorded: () => Effect.void, beforeResume: () => Effect.void }
) => {
  const state = {
    sequence: 0,
    failed: false,
    configured: 0,
    manifest: null as JiraArtifactRef | null,
    reasons: [] as string[]
  }
  const receipts = new Map<string, number>()
  const layer = makeJiraMigrationWorkflow({
    materialize: () => Effect.succeed(readyPublication),
    publish: () => Effect.void,
    start: () => Effect.void,
    finalize: () => Effect.void,
    scan: () =>
      Effect.gen(function* () {
        yield* scanSnapshot(scanContext, {
          client: yield* JiraClient,
          artifacts: yield* JiraMigrationArtifacts,
          identityOptions,
          progress: () => Effect.succeed(true),
          recordFailure: (_fence, key, failure) =>
            Effect.sync(() => {
              const existing = receipts.get(key)
              if (existing !== undefined) return existing
              if (!state.failed) state.sequence++
              state.failed = true
              state.reasons.push(failure.reason)
              receipts.set(key, state.sequence)
              return state.sequence
            }).pipe(Effect.tap(hooks.recorded)),
          resume: (_fence, sequence) =>
            hooks.beforeResume(sequence).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  if (sequence < state.sequence)
                    return {
                      _tag: "AwaitRetry",
                      failureSequence: state.sequence
                    } as const
                  if (sequence !== state.sequence)
                    return { _tag: "Rejected" } as const
                  state.failed = false
                  return { _tag: "Resumed" } as const
                })
              )
            ),
          configured: (_fence, result) =>
            Effect.sync(() => {
              state.configured++
              state.manifest = result.manifest
              return true
            })
        })
      })
  }).pipe(
    Layer.provideMerge(fixture.layer),
    Layer.provideMerge(WorkflowEngine.layerMemory)
  )
  return { state, layer }
}
const completeRetry = (executionId: string, sequence: number) => {
  const deferred = retryDeferred(sequence)
  return DurableDeferred.succeed(deferred, {
    token: DurableDeferred.tokenFromExecutionId(deferred, {
      workflow: JiraMigrationWorkflow,
      executionId
    }),
    value: { failureSequence: sequence }
  })
}

describe("scan retry and coverage", () => {
  it.effect(
    "waits exactly Retry-After on the durable clock before a new page activity",
    () => {
      let calls = 0
      const times: number[] = []
      const fixture = makeScanTestLayer((request) =>
        Effect.gen(function* () {
          if (request.url.endsWith("/search/jql")) {
            times.push(yield* Clock.currentTimeMillis)
            if (calls++ === 0) return response({}, 429, { "retry-after": "7" })
          }
          return scanFixtureResponse(request)
        })
      )
      const harness = snapshotHarness(fixture)
      return Effect.gen(function* () {
        const id = yield* JiraMigrationWorkflow.execute(createPayload, {
          discard: true
        })
        yield* waitUntilSuspended(id)
        expect(calls).toBe(1)
        yield* TestClock.adjust("6999 millis")
        expect(calls).toBe(1)
        yield* TestClock.adjust("1 millis")
        yield* waitUntilSuspended(id)
        expect(calls).toBe(2)
        expect(times[1] - times[0]).toBe(7000)
        expect(harness.state.configured).toBe(1)
        expect(harness.state.sequence).toBe(0)
      }).pipe(Effect.provide(harness.layer))
    }
  )
  it.effect(
    "exhausts bounded transient retries once per user generation without catching resumed failures twice",
    () => {
      let unavailable = true
      let calls = 0
      const fixture = makeScanTestLayer((request) =>
        Effect.sync(() => {
          if (request.url.endsWith("/search/jql")) {
            calls++
            if (unavailable) return response({}, 503)
          }
          return scanFixtureResponse(request)
        })
      )
      const harness = snapshotHarness(fixture)
      return Effect.gen(function* () {
        const id = yield* JiraMigrationWorkflow.execute(createPayload, {
          discard: true
        })
        yield* TestClock.adjust("5 seconds")
        yield* waitUntilSuspended(id)
        expect(calls).toBe(4)
        expect(harness.state.sequence).toBe(1)
        yield* completeRetry(id, 1)
        yield* TestClock.adjust("5 seconds")
        yield* waitUntilSuspended(id)
        expect(calls).toBe(8)
        expect(harness.state.sequence).toBe(2)
        yield* completeRetry(id, 1)
        yield* JiraMigrationWorkflow.resume(id)
        yield* waitUntilSuspended(id)
        expect(calls).toBe(8)
        unavailable = false
        yield* completeRetry(id, 2)
        yield* waitUntilSuspended(id)
        expect(calls).toBe(9)
        expect(harness.state.sequence).toBe(2)
        expect(harness.state.configured).toBe(1)
      }).pipe(Effect.provide(harness.layer))
    }
  )
  it.effect(
    "bounds actual dependent HTTP requests while retaining every manifest category",
    () => {
      let active = 0
      let peak = 0
      const fixture = makeScanTestLayer((request) =>
        Effect.gen(function* () {
          const url = new URL(request.url)
          const path = url.pathname
          if (path.includes("/issue/")) {
            active++
            peak = Math.max(peak, active)
            yield* Effect.yieldNow
            yield* Effect.yieldNow
            active--
          }
          if (path.endsWith("/search/jql"))
            return response({
              issues: [1, 2, 3, 4, 5, 6].map((id) => ({
                id: String(id),
                key: `APP-${id}`,
                fields: {
                  ...scanIssue(id).fields,
                  customfield_rank: `rank-${id}`,
                  attachment: [
                    {
                      id: `a${id}`,
                      filename: "a.png",
                      mimeType: "image/png",
                      size: 3,
                      content: "https://jira.test/attachment"
                    }
                  ],
                  fixVersions: [{ id: "v1" }],
                  ...(id === 1
                    ? { issuetype: { id: "epic" } }
                    : id === 6
                      ? { issuetype: { id: "subtask" }, parent: { id: "2" } }
                      : { parent: { id: "1" } }),
                  security: { id: "restricted" },
                  issuelinks:
                    id === 1
                      ? [
                          {
                            id: "l1",
                            type: { name: "Blocks" },
                            outwardIssue: { id: "2" }
                          }
                        ]
                      : []
                }
              })),
              isLast: true
            })
          if (path.endsWith("/statuses"))
            return response([
              {
                id: "t1",
                name: "Task",
                statuses: [{ id: "s1", name: "Todo" }]
              },
              {
                id: "epic",
                name: "Epic",
                statuses: [{ id: "s1", name: "Todo" }]
              },
              {
                id: "subtask",
                name: "Subtask",
                subtask: true,
                statuses: [{ id: "s1", name: "Todo" }]
              }
            ])
          if (path.endsWith("/field"))
            return response([
              {
                id: "customfield_rank",
                name: "Rank",
                custom: true,
                schema: {
                  type: "string",
                  custom: "com.pyxis.greenhopper.jira:rank"
                }
              }
            ])
          if (path.endsWith("/version"))
            return response(
              offsetPage([{ id: "v1", name: "Release", released: false }])
            )
          if (path.endsWith("/board"))
            return response(
              offsetPage([{ id: 1, name: "Board", type: "scrum" }])
            )
          if (path.endsWith("/configuration"))
            return response({ id: 1, name: "Board", type: "scrum" })
          if (path.endsWith("/sprint"))
            return response(
              offsetPage([{ id: 1, name: "Sprint", state: "active" }])
            )
          if (path.endsWith("/sprint/1/issue"))
            return response({
              issues: [{ id: "2", key: "APP-2" }],
              isLast: true
            })
          const issueId = path.match(/\/issue\/(\d+)\//)?.[1]
          if (path.endsWith("/comment"))
            return response({
              ...offsetPage([]),
              comments: [
                {
                  id: `c${issueId}`,
                  author: scanUser,
                  body: "comment body",
                  created: "2026-01-01",
                  visibility: { type: "group" }
                }
              ]
            })
          if (path.endsWith("/changelog"))
            return response(
              offsetPage([
                {
                  id: `h${issueId}`,
                  author: scanUser,
                  created: "2026-01-01",
                  items: [{ fieldId: "status", from: "s1", to: "s1" }]
                }
              ])
            )
          if (path.endsWith("/worklog"))
            return response({
              ...offsetPage([]),
              worklogs: [
                {
                  id: `w${issueId}`,
                  author: scanUser,
                  comment: "work",
                  created: "2026-01-01",
                  updated: "2026-01-01",
                  started: "2026-01-01",
                  timeSpentSeconds: 60,
                  visibility: { type: "group" }
                }
              ]
            })
          return scanFixtureResponse(request)
        })
      )
      const harness = snapshotHarness(fixture)
      return Effect.gen(function* () {
        const id = yield* JiraMigrationWorkflow.execute(createPayload, {
          discard: true
        })
        yield* waitUntilSuspended(id)
        expect(peak).toBeGreaterThan(1)
        expect(peak).toBeLessThanOrEqual(4)
        expect(harness.state.configured).toBe(1)
        const artifacts = yield* JiraMigrationArtifacts
        const manifest = yield* artifacts.readJson(
          "acme",
          harness.state.manifest!,
          JiraMigrationManifestV2
        )
        for (const category of [
          "fieldDefinitions",
          "workflows",
          "identities",
          "statuses",
          "issueTypes",
          "priorities",
          "components",
          "issues",
          "comments",
          "changelogs",
          "worklogs",
          "watchers",
          "votes",
          "attachments",
          "parentsSubtasks",
          "epics",
          "sprints",
          "versionsReleases",
          "ranks",
          "links",
          "restrictions",
          "productApps",
          "customFields",
          "coverage",
          "rawArtifacts",
          "schemaVersions",
          "converterVersions"
        ] as const)
          expect(manifest[category].length, category).toBeGreaterThan(0)
        expect(manifest.attachments[0]).toMatchObject({
          metadataArtifact: { contentType: "application/json" },
          downloadAllowed: true
        })
        expect(manifest.sprints[0]?.issueIds).toEqual(["2"])
        expect(
          manifest.rawArtifacts.filter((ref) =>
            ref.key.includes("/raw/attachments/")
          )
        ).toHaveLength(6)
      }).pipe(Effect.provide(harness.layer))
    }
  )
  it.effect(
    "archives unavailable optional data as permission coverage warnings",
    () => {
      const fixture = makeScanTestLayer((request) =>
        Effect.succeed(
          request.url.endsWith("/watchers")
            ? response({}, 403)
            : scanFixtureResponse(request)
        )
      )
      const harness = snapshotHarness(fixture)
      return Effect.gen(function* () {
        const id = yield* JiraMigrationWorkflow.execute(createPayload, {
          discard: true
        })
        yield* waitUntilSuspended(id)
        expect(harness.state.configured).toBe(1)
        const artifacts = yield* JiraMigrationArtifacts
        const manifest = yield* artifacts.readJson(
          "acme",
          harness.state.manifest!,
          JiraMigrationManifestV2
        )
        expect(manifest.watchers).toEqual([])
        expect(manifest.coverage).toContainEqual({
          category: "watchers",
          visibility: "partial",
          reason: "permission_denied"
        })
        expect(
          manifest.warnings.some((warning) => warning.category === "watchers")
        ).toBe(true)
      }).pipe(Effect.provide(harness.layer))
    }
  )
})

it.effect(
  "keeps inaccessible core issue data blocking rather than reporting a completed scan",
  () => {
    const fixture = makeScanTestLayer((request) =>
      Effect.succeed(
        request.url.endsWith("/search/jql")
          ? response({}, 403)
          : scanFixtureResponse(request)
      )
    )
    const harness = snapshotHarness(fixture)
    return Effect.gen(function* () {
      const result = yield* Effect.result(
        JiraMigrationWorkflow.execute(createPayload)
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "JiraMigrationWorkflowFailure", retryable: false }
      })
      expect(harness.state.configured).toBe(0)
    }).pipe(Effect.provide(harness.layer))
  }
)

it.effect(
  "converges overlapping dependent failures and resumes both logical units",
  () => {
    let unavailable = true
    const fixture = makeScanTestLayer((request) =>
      Effect.succeed(
        unavailable && /\/(comment|worklog)\?/.test(request.url)
          ? response({}, 503)
          : scanFixtureResponse(request)
      )
    )
    const harness = snapshotHarness(fixture)
    return Effect.gen(function* () {
      const id = yield* JiraMigrationWorkflow.execute(createPayload, {
        discard: true
      })
      yield* TestClock.adjust("5 seconds")
      yield* waitUntilSuspended(id)
      expect(harness.state.sequence).toBe(1)
      expect(harness.state.reasons).toHaveLength(2)
      expect(
        fixture.requests.filter((request) => request.url.includes("/comment?"))
      ).toHaveLength(4)
      expect(
        fixture.requests.filter((request) => request.url.includes("/worklog?"))
      ).toHaveLength(4)
      unavailable = false
      yield* completeRetry(id, 1)
      yield* waitUntilSuspended(id)
      expect(harness.state.configured).toBe(1)
      expect(harness.state.sequence).toBe(1)
    }).pipe(Effect.provide(harness.layer))
  }
)

it.effect(
  "retries manifest storage failure without refetching completed Jira pages",
  () => {
    let unavailable = true
    const fixture = makeScanTestLayer(
      (request) => Effect.succeed(scanFixtureResponse(request)),
      (key) => unavailable && key.includes("/manifest/")
    )
    const harness = snapshotHarness(fixture)
    return Effect.gen(function* () {
      const id = yield* JiraMigrationWorkflow.execute(createPayload, {
        discard: true
      })
      yield* waitUntilSuspended(id)
      expect(harness.state.sequence).toBe(1)
      expect(harness.state.configured).toBe(0)
      unavailable = false
      yield* completeRetry(id, 1)
      yield* waitUntilSuspended(id)
      expect(harness.state.configured).toBe(1)
      expect(
        fixture.requests.filter((request) =>
          request.url.endsWith("/search/jql")
        )
      ).toHaveLength(1)
      expect(harness.state.sequence).toBe(1)
    }).pipe(Effect.provide(harness.layer))
  }
)

it.effect(
  "reuses snapshotted identity options and timestamps across build retry",
  () => {
    let unavailable = true
    let identityCalls = 0
    let name = "Original member"
    const fixture = makeScanTestLayer(
      (request) => Effect.succeed(scanFixtureResponse(request)),
      (key) => unavailable && key.includes("/manifest/summary/")
    )
    const harness = snapshotHarness(
      fixture,
      Effect.sync(() => {
        identityCalls++
        return [
          { id: "member-1", name, email: "member@example.com", imageUrl: null }
        ]
      })
    )
    return Effect.gen(function* () {
      const id = yield* JiraMigrationWorkflow.execute(createPayload, {
        discard: true
      })
      yield* waitUntilSuspended(id)
      expect(harness.state.sequence).toBe(1)
      const requirementsKey = [...fixture.objects.keys()].find((key) =>
        key.includes("/manifest/requirements/")
      )!
      const before = new TextDecoder().decode(
        fixture.objects.get(requirementsKey)
      )
      expect(before).toContain("Original member")
      const manifestKey = [...fixture.objects.keys()].find((key) =>
        key.includes("/manifest/manifest-v2/")
      )!
      const manifestBefore = new TextDecoder().decode(
        fixture.objects.get(manifestKey)
      )
      name = "Changed member"
      yield* TestClock.adjust("1 day")
      unavailable = false
      yield* completeRetry(id, 1)
      yield* waitUntilSuspended(id)
      expect(harness.state.configured).toBe(1)
      expect(identityCalls).toBe(1)
      expect(
        new TextDecoder().decode(fixture.objects.get(requirementsKey))
      ).toBe(before)
      expect(new TextDecoder().decode(fixture.objects.get(manifestKey))).toBe(
        manifestBefore
      )
      expect(manifestBefore).toContain(scanContext.scannedAt)
    }).pipe(Effect.provide(harness.layer))
  }
)

for (const alreadyAccepted of [false, true]) {
  it.effect(
    `joins a newer sibling generation that is ${alreadyAccepted ? "already accepted" : "still pending"}`,
    () =>
      Effect.gen(function* () {
        const generationTwo = yield* Deferred.make<void>()
        const releaseOlderResume = yield* Deferred.make<void>()
        const releaseNewerFailure = yield* Deferred.make<void>()
        let firstGenerationResumes = 0
        let unavailable = true
        const fixture = makeScanTestLayer((request) =>
          Effect.succeed(
            unavailable && /\/(comment|worklog)\?/.test(request.url)
              ? response({}, 503)
              : scanFixtureResponse(request)
          )
        )
        const harness = snapshotHarness(fixture, Effect.succeed([]), {
          recorded: (sequence) =>
            sequence === 2
              ? Deferred.succeed(generationTwo, undefined).pipe(
                  Effect.andThen(
                    alreadyAccepted
                      ? Deferred.await(releaseNewerFailure)
                      : Effect.void
                  )
                )
              : Effect.void,
          beforeResume: (sequence) =>
            Effect.suspend(() => {
              if (sequence === 1 && ++firstGenerationResumes === 2)
                return Deferred.await(releaseOlderResume)
              return Effect.void
            })
        })
        yield* Effect.gen(function* () {
          const id = yield* JiraMigrationWorkflow.execute(createPayload, {
            discard: true
          })
          yield* TestClock.adjust("5 seconds")
          yield* waitUntilSuspended(id)
          expect(harness.state.reasons).toHaveLength(2)
          yield* completeRetry(id, 1)
          yield* TestClock.adjust("5 seconds")
          yield* Deferred.await(generationTwo)
          expect(harness.state.sequence).toBe(2)
          unavailable = false
          if (alreadyAccepted) {
            harness.state.failed = false
            yield* completeRetry(id, 2)
            yield* Deferred.succeed(releaseNewerFailure, undefined)
          }
          yield* Deferred.succeed(releaseOlderResume, undefined)
          yield* waitUntilSuspended(id)
          if (!alreadyAccepted) {
            expect(harness.state.configured).toBe(0)
            yield* completeRetry(id, 2)
            yield* waitUntilSuspended(id)
          }
          expect(harness.state.configured).toBe(1)
          expect(harness.state.sequence).toBe(2)
          yield* completeStartImport(id, 1)
          expect(yield* JiraMigrationWorkflow.execute(createPayload)).toEqual({
            migrationId: id
          })
        }).pipe(Effect.provide(harness.layer))
      })
  )
}
