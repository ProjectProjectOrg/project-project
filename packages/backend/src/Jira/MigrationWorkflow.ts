import * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import type * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as Effect from "effect/Effect"
import {
  JiraScanResumeResult,
  type JiraMigrationProjectionShape
} from "./MigrationProjection"
import * as Schema from "effect/Schema"
import {
  makeFinalizeMigrationActivity,
  makeStartMigrationActivity,
  type MigrationActivities
} from "./MigrationActivities"
import type { JiraMigrationSource } from "./Migrations"
import { Duration, Stream } from "effect"
import { Activity, DurableClock } from "effect/unstable/workflow"
import {
  cursorHash,
  JiraScanFailure,
  makeScanPageActivity,
  makeBuildManifestActivity,
  makeIdentityOptionsActivity,
  scanError,
  scanFailure,
  scanPageActivityName,
  type JiraScanPageError,
  JiraScanContext,
  type JiraScanKind,
  type ScanSnapshotDependencies
} from "./MigrationActivities"
import { scanCollection, ISSUE_DEPENDENT_CONCURRENCY } from "./Scan"
import type { ScanChunkReference } from "./ScanV2"
import { JiraBoard, JiraIssue, JiraSprint } from "./ClientSchemas"

export { activityName, type MigrationActivities } from "./MigrationActivities"

export const PersistedJiraMigrationSource = Schema.Struct({
  cloudId: Schema.NonEmptyString,
  siteName: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  projectKey: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString
}) satisfies Schema.Schema<JiraMigrationSource>

export const JiraMigrationWorkflowCommand = Schema.Union([
  Schema.TaggedStruct("Create", {
    organizationId: Schema.NonEmptyString,
    userId: Schema.NonEmptyString,
    requestId: Schema.NonEmptyString,
    source: PersistedJiraMigrationSource
  }),
  Schema.TaggedStruct("Rescan", {
    supersededExecutionId: Schema.NonEmptyString,
    migrationId: Schema.NonEmptyString,
    expectedRevision: Schema.Int,
    workflowAttempt: Schema.Int,
    scanRevision: Schema.Int
  })
])

export const JiraMigrationWorkflowPayload = Schema.Struct({
  command: JiraMigrationWorkflowCommand
})
export type JiraMigrationWorkflowPayloadValue =
  typeof JiraMigrationWorkflowPayload.Type

export const JiraMigrationWorkflowSuccess = Schema.Struct({
  migrationId: Schema.NonEmptyString
})

export const JiraMigrationWorkflowFailure = Schema.TaggedStruct(
  "JiraMigrationWorkflowFailure",
  {
    reason: Schema.NonEmptyString,
    retryable: Schema.Boolean
  }
)
export type JiraMigrationWorkflowFailureValue =
  typeof JiraMigrationWorkflowFailure.Type
export const JiraMigrationWorkflowError = JiraMigrationWorkflowFailure

export const JiraMigrationWorkflow = Workflow.make(
  "ProjectProject/JiraMigration/v1",
  {
    payload: JiraMigrationWorkflowPayload,
    success: JiraMigrationWorkflowSuccess,
    error: JiraMigrationWorkflowError,
    idempotencyKey: ({ command }) =>
      command._tag === "Create"
        ? `create:${command.organizationId}:${command.userId}:${command.requestId}`
        : `${command.migrationId}:${command.workflowAttempt}:${command.expectedRevision}`
  }
)

export const startImportDeferredName = (scanRevision: number) =>
  `StartImport/v1/${scanRevision}`

export const retryDeferredName = (failureSequence: number) =>
  `Retry/v1/${failureSequence}`

export const StartImportSignal = Schema.Struct({ scanRevision: Schema.Int })
export const RetrySignal = Schema.Struct({ failureSequence: Schema.Int })

export const startImportDeferred = (scanRevision: number) =>
  DurableDeferred.make(startImportDeferredName(scanRevision), {
    success: StartImportSignal
  })

export const retryDeferred = (failureSequence: number) =>
  DurableDeferred.make(retryDeferredName(failureSequence), {
    success: RetrySignal
  })

const migrationIdentity = (
  payload: JiraMigrationWorkflowPayloadValue,
  executionId: string
) =>
  payload.command._tag === "Create"
    ? { migrationId: executionId, scanRevision: 1 }
    : {
        migrationId: payload.command.migrationId,
        scanRevision: payload.command.scanRevision
      }

export const makeJiraMigrationWorkflow = <R>(
  activities: MigrationActivities<R>
) =>
  JiraMigrationWorkflow.toLayer((payload, executionId) =>
    Effect.gen(function* () {
      yield* Workflow.addFinalizer((exit) =>
        makeFinalizeMigrationActivity(
          activities.finalize({ executionId, exit })
        )
      )
      yield* makeStartMigrationActivity(
        activities.start({ payload, executionId }),
        JiraMigrationWorkflowFailure
      )
      yield* activities.scan({ payload, executionId })
      const identity = migrationIdentity(payload, executionId)
      yield* DurableDeferred.await(startImportDeferred(identity.scanRevision))
      yield* activities.materialize({ payload, executionId })
      return { migrationId: identity.migrationId }
    })
  )

export const makeProjectionMigrationActivities = (
  projection: JiraMigrationProjectionShape,
  finalize: MigrationActivities<WorkflowEngine.WorkflowEngine>["finalize"],
  scan: MigrationActivities<WorkflowEngine.WorkflowEngine>["scan"],
  materialize: MigrationActivities<WorkflowEngine.WorkflowEngine>["materialize"]
): MigrationActivities<WorkflowEngine.WorkflowEngine> => ({
  start: ({ payload, executionId }) =>
    Effect.gen(function* () {
      if (payload.command._tag === "Create") {
        yield* projection.ensureCreated({ ...payload.command, executionId })
      } else {
        const row = yield* projection.beginRescan({
          ...payload.command,
          executionId
        })
        yield* JiraMigrationWorkflow.interrupt(row.supersededExecutionId)
      }
    }).pipe(
      Effect.mapError((error) => ({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: error.reason,
        retryable: error._tag === "JiraError"
      }))
    ),
  finalize,
  scan,
  materialize
})

export const runScanUnit = <A>(
  context: JiraScanContext,
  dependencies: Pick<ScanSnapshotDependencies, "recordFailure" | "resume">,
  logicalName: string,
  run: (
    operationTry: number
  ) => Effect.Effect<
    A,
    JiraScanPageError,
    WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance
  >
) =>
  Effect.gen(function* () {
    let operationTry = 0
    while (true) {
      const result = yield* Effect.result(run(operationTry))
      if (result._tag === "Success") return result.success
      const failure = result.failure
      if (failure._tag === "JiraRateLimited") {
        yield* DurableClock.sleep({
          name: `v1/rate-limit/${logicalName}/${operationTry}`,
          duration: Duration.millis(failure.retryAfterMillis),
          inMemoryThreshold: Duration.zero
        })
      } else {
        const persisted =
          failure._tag === "JiraTransientFailure"
            ? scanFailure(`jira_${failure.reason}`, true)
            : failure
        if (!persisted.retryable) return yield* persisted
        const operationKey = `${logicalName}/${operationTry}`
        const sequence = yield* Activity.make({
          name: `v1/scan-failure/${operationKey}`,
          success: Schema.NullOr(Schema.Int),
          error: JiraScanFailure,
          execute: dependencies
            .recordFailure(context, operationKey, persisted)
            .pipe(Effect.mapError(scanError))
        })
        if (sequence === null)
          return yield* scanFailure("jira_migration_superseded")
        let awaitedSequence = sequence
        while (true) {
          yield* DurableDeferred.await(retryDeferred(awaitedSequence))
          const resumed = yield* Activity.make({
            name: `v1/scan-resume/${operationKey}/${awaitedSequence}`,
            success: JiraScanResumeResult,
            error: JiraScanFailure,
            execute: dependencies
              .resume(context, awaitedSequence)
              .pipe(Effect.mapError(scanError))
          })
          if (resumed._tag === "Resumed") break
          if (resumed._tag === "Rejected")
            return yield* scanFailure("jira_migration_superseded")
          awaitedSequence = resumed.failureSequence
        }
      }
      operationTry++
    }
  })
export const scanSnapshot = Effect.fn("scanSnapshot")(
  function* (
    requestedContext: JiraScanContext,
    dependencies: ScanSnapshotDependencies
  ) {
    const context = yield* Activity.make({
      name: "v1/scan-context",
      success: JiraScanContext,
      execute: Effect.succeed(requestedContext)
    })
    const identityOptionsArtifact = yield* runScanUnit(
      context,
      dependencies,
      scanPageActivityName({
        kind: "identity-options",
        scanRevision: context.scanRevision,
        parentId: null,
        pageOrdinal: 0,
        cursorHash: cursorHash(null),
        operationTry: 0
      }).replace(/\/0$/, ""),
      (operationTry) =>
        makeIdentityOptionsActivity(context, dependencies, operationTry)
    )
    const chunks: ScanChunkReference[] = []
    const collection = Effect.fn(function* (
      kind: JiraScanKind,
      parentId: string | null = null,
      sourceArtifact?: import("./MigrationArtifacts").JiraArtifactRef
    ) {
      const pages = yield* scanCollection(
        { ...context, kind, parentId, sourceArtifact },
        (input) =>
          runScanUnit(
            context,
            dependencies,
            scanPageActivityName({
              ...input,
              cursorHash: cursorHash(input.cursor)
            }).replace(/\/0$/, ""),
            (operationTry) =>
              makeScanPageActivity({ ...input, operationTry }, dependencies)
          )
      )
      for (const page of pages) {
        chunks.push({
          kind,
          parentId,
          raw: page.raw,
          normalized: page.normalized,
          warnings: page.warnings
        })
      }
      return pages
    })
    for (const kind of [
      "account",
      "project",
      "fields",
      "statuses",
      "priorities",
      "components",
      "versions",
      "boards"
    ] as const)
      yield* collection(kind)
    const readChunks = <A>(
      references: ReadonlyArray<ScanChunkReference>,
      schema: Schema.Decoder<A>
    ) =>
      Effect.forEach(references, (ref) =>
        runScanUnit(
          context,
          dependencies,
          `read-chunk/${ref.normalized.key}`,
          () =>
            dependencies.artifacts
              .readJson(context.orgSlug, ref.normalized, Schema.Array(schema))
              .pipe(Effect.mapError(scanError))
        )
      ).pipe(Effect.map((pages) => pages.flat()))
    yield* collection("issues")
    const issueSources = yield* Effect.forEach(
      chunks.filter((chunk) => chunk.kind === "issues"),
      (chunk) =>
        readChunks([chunk], JiraIssue).pipe(
          Effect.map((issues) =>
            issues.map((issue) => ({
              id: issue.id,
              sourceArtifact: chunk.normalized
            }))
          )
        )
    )
    yield* Stream.fromIterable(
      issueSources.flat().flatMap((source) =>
        (
          [
            "comments",
            "changelogs",
            "worklogs",
            "watchers",
            "votes",
            "attachments"
          ] as const
        ).map((kind) => ({
          id: source.id,
          sourceArtifact: source.sourceArtifact,
          kind
        }))
      )
    ).pipe(
      Stream.mapEffect(
        ({ id, kind, sourceArtifact }) =>
          collection(
            kind,
            id,
            kind === "attachments" ? sourceArtifact : undefined
          ),
        { concurrency: ISSUE_DEPENDENT_CONCURRENCY }
      ),
      Stream.runDrain
    )
    const boards = yield* readChunks(
      chunks.filter((chunk) => chunk.kind === "boards"),
      JiraBoard
    )
    for (const board of boards) {
      yield* collection("boardConfiguration", String(board.id))
      if (board.type !== "scrum") continue
      yield* collection("sprints", String(board.id))
      const sprints = yield* readChunks(
        chunks.filter(
          (chunk) =>
            chunk.kind === "sprints" && chunk.parentId === String(board.id)
        ),
        JiraSprint
      )
      for (const sprint of sprints)
        yield* collection("sprintIssues", `${board.id}:${sprint.id}`)
    }
    return yield* runScanUnit(
      context,
      dependencies,
      `build-manifest/${context.scanRevision}`,
      (operationTry) =>
        makeBuildManifestActivity(
          context,
          chunks,
          identityOptionsArtifact,
          dependencies,
          operationTry
        )
    )
  },
  Effect.mapError((error) => ({
    _tag: "JiraMigrationWorkflowFailure" as const,
    reason: error.reason,
    retryable: error.retryable
  }))
)

export const makeProjectionScanDependencies = (
  projection: JiraMigrationProjectionShape,
  dependencies: Pick<
    ScanSnapshotDependencies,
    "client" | "artifacts" | "identityOptions"
  >
): ScanSnapshotDependencies => ({
  ...dependencies,
  progress: (fence, page) =>
    projection.recordScanProgress(
      fence,
      `${page.kind}/${page.parentId ?? ""}/${page.pageOrdinal}`,
      page.count
    ),
  recordFailure: projection.recordScanFailure,
  resume: projection.resumeScan,
  configured: (fence, result) => projection.completeScan(fence, result)
})
