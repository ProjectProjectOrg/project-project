import { Duration, Schedule, Semaphore, Stream } from "effect"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { Activity, DurableClock } from "effect/workflow"
import * as DurableDeferred from "effect/workflow/DurableDeferred"
import * as Workflow from "effect/workflow/Workflow"
import type * as WorkflowEngine from "effect/workflow/WorkflowEngine"

import { JiraBoard, JiraIssue, JiraSprint } from "./ClientSchemas"
import {
  AUTOMATIC_RETRY_BUDGET,
  automaticRetryDelayMillis,
  defineFinalizeMigrationActivity,
  defineStartMigrationActivity,
  errorDetail,
  type ImportUnitOptions,
  type ImportUnitRunner,
  type MigrationActivities
} from "./MigrationActivities"
import {
  cursorHash,
  JiraScanFailure,
  defineScanPageActivity,
  defineBuildManifestActivity,
  defineIdentityOptionsActivity,
  scanError,
  scanFailure,
  scanPageActivityName,
  type JiraScanPageError,
  JiraScanContext,
  type ScanSnapshotDependencies
} from "./MigrationActivities"
import * as MigrationArtifacts from "./MigrationArtifacts"
import * as MigrationProjection from "./MigrationProjection"
import type * as Migrations from "./Migrations"
import { scanCollection, ISSUE_DEPENDENT_CONCURRENCY } from "./Scan"
import type { JiraScanKind } from "./scanKinds"
import { issueDetailKinds, type ScanChunkReference } from "./ScanV2"

const decodeUnknownJiraIssueArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraIssue)
)

const decodeUnknownJiraBoardArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraBoard)
)

const decodeUnknownJiraSprintArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraSprint)
)

export { activityName, type MigrationActivities } from "./MigrationActivities"

export const PersistedJiraMigrationSource = Schema.Struct({
  cloudId: Schema.NonEmptyString,
  siteName: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  projectKey: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString
}) satisfies Schema.Schema<Migrations.JiraMigrationSource>

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
]).pipe(Schema.toTaggedUnion("_tag"))

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
    retryable: Schema.Boolean,
    retryAfterMillis: Schema.optional(Schema.Int),
    reconnect: Schema.optional(Schema.Boolean),
    transient: Schema.optional(Schema.Boolean),
    subject: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String)
  }
)

const isJiraMigrationWorkflowFailure = Schema.is(JiraMigrationWorkflowFailure)
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
      JiraMigrationWorkflowCommand.match(command, {
        Create: (command) =>
          `create:${command.organizationId}:${command.userId}:${command.requestId}`,
        Rescan: (command) =>
          `${command.migrationId}:${command.workflowAttempt}:${command.expectedRevision}`
      })
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
  JiraMigrationWorkflowCommand.match(payload.command, {
    Create: () => ({ migrationId: executionId, scanRevision: 1 }),
    Rescan: (command) => ({
      migrationId: command.migrationId,
      scanRevision: command.scanRevision
    })
  })

const UNIT_GATE_PERMITS = 64
const RATE_LIMIT_RETRY_BUDGET = 20

type UnitDecision =
  | Readonly<{ _tag: "RateLimited"; retryAfterMillis: number }>
  | Readonly<{ _tag: "Transient" }>
  | Readonly<{ _tag: "AwaitUser" }>
  | Readonly<{ _tag: "Fatal" }>

type DurableUnit<A, E, R> = Readonly<{
  logicalName: string
  sleepPrefix: string
  automaticRetryBudget: number
  gate: Semaphore.Semaphore
  classify: (failure: E) => UnitDecision
  heartbeat: Effect.Effect<void, never, R>
  record: (
    operationKey: string,
    failure: E
  ) => Effect.Effect<number | null, E, R>
  resume: (
    operationKey: string,
    sequence: number
  ) => Effect.Effect<MigrationProjection.JiraScanResumeResult, E, R>
  superseded: () => E
  onResume?: ((operationKey: string) => Effect.Effect<void, E, R>) | undefined
  run: (operationTry: number) => Effect.Effect<A, E, R>
}>

const runDurableUnit = <A, E, R>(
  unit: DurableUnit<A, E, R>
): Effect.Effect<
  A,
  E,
  R | WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance
> =>
  Effect.gen(function* () {
    let operationTry = 0
    let automaticRetries = 0
    while (true) {
      const result = yield* Effect.result(
        unit.gate.withPermits(1)(unit.run(operationTry))
      )
      if (Result.isSuccess(result)) return result.success
      const failure = result.failure
      const decision = unit.classify(failure)
      if (decision._tag === "Fatal") return yield* Effect.fail(failure)
      if (
        decision._tag !== "AwaitUser" &&
        automaticRetries <
          (decision._tag === "RateLimited"
            ? RATE_LIMIT_RETRY_BUDGET
            : unit.automaticRetryBudget)
      ) {
        yield* unit.heartbeat
        const sleep = DurableClock.sleep({
          name: `${unit.sleepPrefix}/${unit.logicalName}/${operationTry}`,
          duration: Duration.millis(
            automaticRetryDelayMillis(
              automaticRetries,
              unit.logicalName,
              decision._tag === "RateLimited" ? decision.retryAfterMillis : 0
            )
          ),
          ...(decision._tag === "RateLimited"
            ? { inMemoryThreshold: Duration.zero }
            : {})
        })
        yield* decision._tag === "RateLimited"
          ? unit.gate.withPermits(UNIT_GATE_PERMITS)(sleep)
          : sleep
        automaticRetries++
        operationTry++
        continue
      }
      const operationKey = `${unit.logicalName}/${operationTry}`
      const sequence = yield* unit.record(operationKey, failure)
      if (sequence === null) return yield* Effect.fail(unit.superseded())
      let awaitedSequence = sequence
      while (true) {
        yield* DurableDeferred.await(retryDeferred(awaitedSequence))
        const resumed = yield* unit.resume(operationKey, awaitedSequence)
        if (MigrationProjection.JiraScanResumeResult.guards.Resumed(resumed))
          break
        if (MigrationProjection.JiraScanResumeResult.guards.Rejected(resumed))
          return yield* Effect.fail(unit.superseded())
        awaitedSequence = resumed.failureSequence
      }
      if (unit.onResume !== undefined) yield* unit.onResume(operationKey)
      automaticRetries = 0
      operationTry++
    }
  })

const supersededImport = () =>
  JiraMigrationWorkflowFailure.make({
    reason: "jira_migration_superseded",
    retryable: false
  })

const classifyImportFailure = (
  failure: Readonly<{
    retryAfterMillis?: number | undefined
    retryable: boolean
    transient?: boolean | undefined
  }>
): UnitDecision =>
  failure.retryAfterMillis !== undefined
    ? { _tag: "RateLimited", retryAfterMillis: failure.retryAfterMillis }
    : !failure.retryable
      ? { _tag: "Fatal" }
      : failure.transient === true
        ? { _tag: "Transient" }
        : { _tag: "AwaitUser" }

const classifyScanFailure = (failure: JiraScanPageError): UnitDecision =>
  Predicate.isTagged(failure, "JiraRateLimited")
    ? { _tag: "RateLimited", retryAfterMillis: failure.retryAfterMillis }
    : Predicate.isTagged(failure, "JiraTransientFailure")
      ? classifyImportFailure({
          retryable: true,
          transient: true,
          retryAfterMillis: failure.retryAfterMillis
        })
      : classifyImportFailure(failure)

export const makeJiraMigrationWorkflow = <R>(
  activities: MigrationActivities<R>
) =>
  JiraMigrationWorkflow.toLayer((payload, executionId) =>
    Effect.gen(function* () {
      const input = { payload, executionId }
      const gate = yield* Semaphore.make(UNIT_GATE_PERMITS)
      const heartbeat = activities.heartbeat(input)
      const unit: ImportUnitRunner<R> = <A, R1, R2 = never>(
        logicalName: string,
        run: (
          operationTry: number
        ) => Effect.Effect<A, JiraMigrationWorkflowFailureValue, R1>,
        options?: ImportUnitOptions<R2>
      ) =>
        runDurableUnit<
          A,
          JiraMigrationWorkflowFailureValue,
          | R
          | R1
          | R2
          | WorkflowEngine.WorkflowEngine
          | WorkflowEngine.WorkflowInstance
        >({
          logicalName,
          sleepPrefix: "v1/import-retry",
          automaticRetryBudget: AUTOMATIC_RETRY_BUDGET,
          gate,
          classify: classifyImportFailure,
          heartbeat,
          record: (operationKey, failure) =>
            Activity.make({
              name: `v1/import-failure/${operationKey}`,
              success: Schema.NullOr(Schema.Int),
              error: JiraMigrationWorkflowFailure,
              execute: activities.recordImportFailure(
                input,
                operationKey,
                failure
              )
            }),
          resume: (operationKey, sequence) =>
            Activity.make({
              name: `v1/import-resume/${operationKey}/${sequence}`,
              success: MigrationProjection.JiraScanResumeResult,
              error: JiraMigrationWorkflowFailure,
              execute: activities.resumeImport(input, sequence)
            }),
          superseded: supersededImport,
          onResume: options?.onResume,
          run
        })
      yield* Workflow.addFinalizer((exit) =>
        defineFinalizeMigrationActivity(
          activities.finalize({ executionId, exit })
        )
      )
      yield* defineStartMigrationActivity(
        activities.start({ payload, executionId }),
        JiraMigrationWorkflowFailure
      )
      yield* activities.scan({ payload, executionId })
      const identity = migrationIdentity(payload, executionId)
      yield* DurableDeferred.await(startImportDeferred(identity.scanRevision))
      const ready = yield* activities.materialize(input, unit)
      yield* activities.publish(input, ready, unit)
      return { migrationId: identity.migrationId }
    })
  )

export const withJiraRemoteWriteIntent = <A, E, R>(
  projection: MigrationProjection.JiraMigrationProjection["Service"],
  fence: MigrationProjection.AttemptFence,
  run: Effect.Effect<A, E, R>
): Effect.Effect<A, E | JiraMigrationWorkflowFailureValue, R> =>
  Effect.gen(function* () {
    const accepted = yield* projection.beginRemoteWrites(fence).pipe(
      Effect.mapError(() => ({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: "jira_migration_write_intent_failed",
        retryable: true
      }))
    )
    if (!accepted)
      return yield* Effect.fail({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: "jira_migration_superseded",
        retryable: false
      })
    const value = yield* run
    const settled = yield* projection.settleRemoteWrites(fence).pipe(
      Effect.mapError(() => ({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: "jira_migration_write_intent_failed",
        retryable: true
      }))
    )
    if (!settled)
      return yield* Effect.fail({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: "jira_migration_superseded",
        retryable: false
      })
    return value
  })

export const finalizeJiraMigrationAttempt = Effect.fn(
  "JiraMigration.finalizeAttempt"
)(function* (
  projection: MigrationProjection.JiraMigrationProjection["Service"],
  fence: MigrationProjection.AttemptFence,
  exit: Exit.Exit<unknown, unknown>
) {
  if (Exit.isSuccess(exit)) return
  const cancelled = yield* projection.finalizeInterrupted(fence)
  if (cancelled || Cause.hasInterruptsOnly(exit.cause)) return
  const error = Cause.findErrorOption(exit.cause)
  const failure =
    Option.isSome(error) && isJiraMigrationWorkflowFailure(error.value)
      ? error.value
      : JiraMigrationWorkflowFailure.make({
          reason: "jira_migration_workflow_defect",
          retryable: false,
          detail:
            errorDetail(Option.getOrUndefined(error)) ?? "unexpected error"
        })
  yield* Effect.logError("Jira migration attempt failed", {
    migrationId: fence.migrationId,
    reason: failure.reason,
    cause: exit.cause
  })
  yield* projection.recordFailure(fence, failure)
})

export const DATABASE_RETRY = {
  schedule: Schedule.exponential("500 millis").pipe(Schedule.jittered),
  times: 8
} as const

export const makeProjectionMigrationActivities = <R>(
  projection: MigrationProjection.JiraMigrationProjection["Service"],
  finalize: MigrationActivities<R>["finalize"],
  scan: MigrationActivities<R>["scan"],
  materialize: MigrationActivities<R>["materialize"],
  publish: MigrationActivities<R>["publish"]
): MigrationActivities<R | WorkflowEngine.WorkflowEngine> => {
  const fenceForActivity = (
    input: Parameters<typeof scan>[0]
  ): MigrationProjection.AttemptFence =>
    JiraMigrationWorkflowCommand.match(input.payload.command, {
      Create: () => ({
        migrationId: input.executionId,
        workflowExecutionId: input.executionId,
        workflowAttempt: 1
      }),
      Rescan: (command) => ({
        migrationId: command.migrationId,
        workflowExecutionId: input.executionId,
        workflowAttempt: command.workflowAttempt
      })
    })
  return {
    start: ({ payload, executionId }) =>
      Effect.gen(function* () {
        if (JiraMigrationWorkflowCommand.guards.Create(payload.command)) {
          yield* projection.ensureCreated({ ...payload.command, executionId })
        } else {
          const row = yield* projection.beginRescan({
            ...payload.command,
            executionId
          })
          yield* JiraMigrationWorkflow.interrupt(row.supersededExecutionId)
        }
      }).pipe(
        Effect.retry({
          ...DATABASE_RETRY,
          while: (error) => Predicate.isTagged(error, "JiraError")
        }),
        Effect.mapError((error) =>
          JiraMigrationWorkflowFailure.make({
            reason: error.reason,
            retryable: false
          })
        )
      ),
    finalize,
    scan,
    materialize,
    publish,
    heartbeat: (input) =>
      projection.heartbeat(fenceForActivity(input)).pipe(Effect.ignore),
    recordImportFailure: (input, operationKey, failure) =>
      projection
        .recordImportFailure(fenceForActivity(input), operationKey, failure)
        .pipe(
          Effect.retry(DATABASE_RETRY),
          Effect.mapError(() =>
            JiraMigrationWorkflowFailure.make({
              reason: "jira_migration_database_failed",
              retryable: false
            })
          )
        ),
    resumeImport: (input, sequence) =>
      projection.resumeImport(fenceForActivity(input), sequence).pipe(
        Effect.retry(DATABASE_RETRY),
        Effect.mapError(() =>
          JiraMigrationWorkflowFailure.make({
            reason: "jira_migration_database_failed",
            retryable: false
          })
        )
      )
  }
}

const persistedScanFailure = (failure: JiraScanPageError): JiraScanFailure =>
  Match.value(failure).pipe(
    Match.tag("JiraTransientFailure", (failure) =>
      scanFailure(`jira_${failure.reason}`, true)
    ),
    Match.tag("JiraRateLimited", () => scanFailure("jira_rate_limited", true)),
    Match.orElse((failure) => failure)
  )

export const runScanUnit = <A>(
  context: JiraScanContext,
  dependencies: Pick<
    ScanSnapshotDependencies,
    "recordFailure" | "resume" | "gate" | "heartbeat" | "automaticRetryBudget"
  >,
  logicalName: string,
  run: (
    operationTry: number
  ) => Effect.Effect<
    A,
    JiraScanPageError,
    WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance
  >
) =>
  runDurableUnit<
    A,
    JiraScanPageError,
    WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance
  >({
    logicalName,
    sleepPrefix: "v1/rate-limit",
    automaticRetryBudget: dependencies.automaticRetryBudget,
    gate: dependencies.gate,
    classify: classifyScanFailure,
    heartbeat: dependencies.heartbeat(context).pipe(Effect.ignore),
    record: (operationKey, failure) =>
      Activity.make({
        name: `v1/scan-failure/${operationKey}`,
        success: Schema.NullOr(Schema.Int),
        error: JiraScanFailure,
        execute: dependencies
          .recordFailure(context, operationKey, persistedScanFailure(failure))
          .pipe(Effect.mapError(scanError))
      }),
    resume: (operationKey, sequence) =>
      Activity.make({
        name: `v1/scan-resume/${operationKey}/${sequence}`,
        success: MigrationProjection.JiraScanResumeResult,
        error: JiraScanFailure,
        execute: dependencies
          .resume(context, sequence)
          .pipe(Effect.mapError(scanError))
      }),
    superseded: () => scanFailure("jira_migration_superseded"),
    run
  }).pipe(Effect.mapError(persistedScanFailure))
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
        defineIdentityOptionsActivity(context, dependencies, operationTry)
    )
    const chunks: Array<ScanChunkReference> = []
    const collection = Effect.fn(function* (
      kind: JiraScanKind,
      parentId: string | null = null
    ) {
      const pages = yield* scanCollection(
        { ...context, kind, parentId },
        (input) =>
          runScanUnit(
            context,
            dependencies,
            scanPageActivityName({
              ...input,
              cursorHash: cursorHash(input.cursor)
            }).replace(/\/0$/, ""),
            (operationTry) =>
              defineScanPageActivity({ ...input, operationTry }, dependencies)
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
      decode: ReturnType<
        typeof Schema.decodeUnknownEffect<Schema.Decoder<ReadonlyArray<A>>>
      >
    ) =>
      Effect.forEach(references, (ref) =>
        runScanUnit(
          context,
          dependencies,
          `read-chunk/${ref.normalized.key}`,
          () =>
            dependencies.artifacts
              .readJson(context.orgSlug, ref.normalized, decode)
              .pipe(Effect.mapError(scanError))
        )
      ).pipe(Effect.map((pages) => pages.flat()))
    yield* collection("issues")
    const issueSources = yield* Effect.forEach(
      chunks.filter((chunk) => chunk.kind === "issues"),
      (chunk) =>
        readChunks([chunk], decodeUnknownJiraIssueArray).pipe(
          Effect.map((issues) =>
            issues.map((issue) => ({
              id: issue.id,
              kinds: issueDetailKinds(issue)
            }))
          )
        )
    )
    yield* runScanUnit(
      context,
      dependencies,
      `scan-details/${context.scanRevision}`,
      (operationTry) =>
        Activity.make({
          name: `v1/scan-details/${context.scanRevision}/${operationTry}`,
          success: Schema.Boolean,
          error: JiraScanFailure,
          execute: dependencies
            .beginScanDetails(
              context,
              issueSources
                .flat()
                .reduce((total, source) => total + source.kinds.length, 0)
            )
            .pipe(Effect.mapError(scanError))
        })
    )
    yield* Stream.fromIterable(
      issueSources
        .flat()
        .flatMap((source) =>
          source.kinds.map((kind) => ({ id: source.id, kind }))
        )
    ).pipe(
      Stream.mapEffect(({ id, kind }) => collection(kind, id), {
        concurrency: ISSUE_DEPENDENT_CONCURRENCY
      }),
      Stream.runDrain
    )
    const boards = yield* readChunks(
      chunks.filter((chunk) => chunk.kind === "boards"),
      decodeUnknownJiraBoardArray
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
        decodeUnknownJiraSprintArray
      )
      for (const sprint of sprints)
        yield* collection("sprintIssues", `${board.id}:${sprint.id}`)
    }
    return yield* runScanUnit(
      context,
      dependencies,
      `build-manifest/${context.scanRevision}`,
      (operationTry) =>
        defineBuildManifestActivity(
          context,
          chunks,
          identityOptionsArtifact,
          dependencies,
          operationTry
        )
    )
  },
  Effect.mapError((error) =>
    JiraMigrationWorkflowFailure.make({
      reason: error.reason,
      retryable: error.retryable,
      ...(error.subject === undefined ? {} : { subject: error.subject }),
      ...(error.detail === undefined ? {} : { detail: error.detail })
    })
  )
)

const SCAN_ARTIFACT_WRITE_CONCURRENCY = 8

export const makeProjectionScanDependencies = (
  projection: MigrationProjection.JiraMigrationProjection["Service"],
  dependencies: Pick<
    ScanSnapshotDependencies,
    "client" | "artifacts" | "identityOptions"
  >,
  fence: MigrationProjection.AttemptFence
): ScanSnapshotDependencies => {
  const writeLock = Semaphore.makeUnsafe(1)
  return {
    ...dependencies,
    writeJsonBatch: (orgSlug, items) =>
      writeLock
        .withPermits(1)(
          withJiraRemoteWriteIntent(
            projection,
            fence,
            Effect.forEach(
              items,
              ({ coordinates, value }) =>
                dependencies.artifacts.writeJson(orgSlug, coordinates, value),
              { concurrency: SCAN_ARTIFACT_WRITE_CONCURRENCY }
            )
          )
        )
        .pipe(
          Effect.mapError((error) =>
            Match.value(error).pipe(
              Match.tag(
                "JiraMigrationWorkflowFailure",
                () =>
                  new MigrationArtifacts.JiraArtifactError({
                    key:
                      items[0] === undefined
                        ? "batch"
                        : MigrationArtifacts.artifactKey(items[0].coordinates),
                    reason: "write_intent"
                  })
              ),
              Match.orElse((error) => error)
            )
          )
        ),
    artifacts: {
      ...dependencies.artifacts,
      writeJson: (orgSlug, coordinates, value) =>
        writeLock
          .withPermits(1)(
            withJiraRemoteWriteIntent(
              projection,
              fence,
              dependencies.artifacts.writeJson(orgSlug, coordinates, value)
            )
          )
          .pipe(
            Effect.mapError((error) =>
              Match.value(error).pipe(
                Match.tag(
                  "JiraMigrationWorkflowFailure",
                  () =>
                    new MigrationArtifacts.JiraArtifactError({
                      key: MigrationArtifacts.artifactKey(coordinates),
                      reason: "write_intent"
                    })
                ),
                Match.orElse((error) => error)
              )
            )
          )
    },
    progress: (fence, page) =>
      projection.recordScanProgress(
        fence,
        `${page.kind}/${page.parentId ?? ""}/${page.pageOrdinal}`,
        page.count
      ),
    finding: projection.recordFinding,
    heartbeat: projection.heartbeat,
    beginScanDetails: projection.beginScanDetails,
    beginScanFinalize: projection.beginScanFinalize,
    gate: Semaphore.makeUnsafe(UNIT_GATE_PERMITS),
    automaticRetryBudget: AUTOMATIC_RETRY_BUDGET,
    recordFailure: projection.recordScanFailure,
    resume: projection.resumeScan,
    configured: (fence, result) => projection.completeScan(fence, result)
  }
}
