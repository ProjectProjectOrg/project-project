import {
  Conflict,
  JiraError,
  JiraMigrationConfiguration,
  JiraMigrationDetail,
  NotFound,
  Validation,
  type JiraMigrationSummary
} from "@projectproject/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import {
  JiraMigrationWorkflow,
  retryDeferred,
  startImportDeferred
} from "./MigrationWorkflow"
import * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Option from "effect/Option"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import {
  actionsFor,
  decodeCheckpoint,
  toSummary,
  type JiraMigrationRow,
  JiraMigrationProjection,
  matchesSource,
  fenceFor,
  type AttemptFence,
  type ProjectionOwner,
  type JiraMigrationCleanupMode
} from "./MigrationProjection"
export {
  actionsFor,
  isCompleteJiraConfiguration,
  type JiraMigrationCheckpoint
} from "./MigrationProjection"

export type JiraMigrationSource = Readonly<{
  cloudId: string
  siteName: string
  siteUrl: string
  projectId: string
  projectKey: string
  projectName: string
}>

export type JiraMigrationMutationError =
  | NotFound
  | Validation
  | Conflict
  | JiraError

export type JiraMigrationsShape = Readonly<{
  list: (
    organizationId: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<JiraMigrationSummary>, JiraError>
  create: (
    organizationId: string,
    userId: string,
    requestId: string,
    source: JiraMigrationSource
  ) => Effect.Effect<JiraMigrationDetail, Conflict | JiraError>
  get: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<JiraMigrationDetail, NotFound | JiraError>
  configure: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number,
    configuration: JiraMigrationConfiguration
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  rescan: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  run: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  cancel: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  discard: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<void, NotFound | Validation>
}>

export class JiraMigrations extends Context.Service<
  JiraMigrations,
  JiraMigrationsShape
>()("@projectproject/backend/Jira/Migrations/JiraMigrations") {}

export const JiraMigrationsWorkflowLive = (
  commands: Pick<JiraMigrationsShape, "run" | "cancel" | "discard">,
  prepareRescan?: (
    row: JiraMigrationRow
  ) => Effect.Effect<JiraMigrationRow, JiraMigrationMutationError>,
  configure?: JiraMigrationsShape["configure"]
) =>
  Layer.effect(
    JiraMigrations,
    Effect.gen(function* () {
      const projection = yield* JiraMigrationProjection
      const engine = yield* WorkflowEngine.WorkflowEngine
      const create = Effect.fn("JiraMigrations.create")(
        function* (
          organizationId: string,
          userId: string,
          requestId: string,
          source: JiraMigrationSource
        ) {
          const executionId = yield* JiraMigrationWorkflow.execute(
            {
              command: {
                _tag: "Create",
                organizationId,
                userId,
                requestId,
                source
              }
            },
            { discard: true }
          )
          const row = yield* projection
            .owned({ organizationId, userId }, executionId)
            .pipe(
              Effect.retry({
                while: (error) => error._tag === "NotFound",
                schedule: Schedule.spaced("20 millis")
              }),
              Effect.timeout("1 second"),
              Effect.mapError((error) =>
                error._tag === "JiraError"
                  ? error
                  : new JiraError({ reason: "timeout" })
              )
            )
          if (!matchesSource(row, source))
            return yield* new Conflict({
              reason: "jira_migration_request_conflict"
            })
          return yield* projection.toDetail(row)
        },
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
      )
      const rescan = Effect.fn("JiraMigrations.rescan")(
        function* (
          organizationId: string,
          userId: string,
          migrationId: string,
          expectedRevision: number
        ) {
          const owner = { organizationId, userId }
          let row = yield* projection.owned(owner, migrationId)
          if (row.revision !== expectedRevision || !fenceFor(row))
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          if (!actionsFor(row).canRescan)
            return yield* new Validation({
              reason: "jira_migration_rescan_not_allowed"
            })
          if (row.destinationProjectId !== null) {
            if (!prepareRescan)
              return yield* new Validation({
                reason: "jira_migration_rescan_not_allowed"
              })
            row = yield* prepareRescan(row)
          }
          const command = {
            _tag: "Rescan" as const,
            supersededExecutionId: row.workflowExecutionId!,
            migrationId,
            expectedRevision: row.revision,
            workflowAttempt: row.workflowAttempt + 1,
            scanRevision: row.scanRevision + 1
          }
          const executionId = yield* JiraMigrationWorkflow.execute(
            { command },
            { discard: true }
          )
          yield* projection.beginRescan({ ...command, executionId })
          yield* JiraMigrationWorkflow.interrupt(row.workflowExecutionId!)
          return yield* projection
            .owned(owner, migrationId)
            .pipe(Effect.flatMap(projection.toDetail))
        },
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
      )
      return JiraMigrations.of({
        ...commands,
        create,
        rescan,
        list: (organizationId, userId) =>
          projection
            .listOwned({ organizationId, userId })
            .pipe(Effect.map((rows) => rows.map(toSummary))),
        get: (organizationId, userId, migrationId) =>
          projection
            .owned({ organizationId, userId }, migrationId)
            .pipe(Effect.flatMap(projection.toDetail)),
        configure:
          configure ??
          ((
            organizationId,
            userId,
            migrationId,
            expectedRevision,
            configuration
          ) =>
            projection.saveConfiguration({
              owner: { organizationId, userId },
              migrationId,
              expectedRevision,
              configuration
            }))
      })
    })
  )

export type JiraMigrationCleanupCommand = AttemptFence &
  Readonly<{
    expectedRevision: number
    mode: JiraMigrationCleanupMode
  }>
export type JiraMigrationCleanupCommands = Readonly<{
  start: (
    input: JiraMigrationCleanupCommand
  ) => Effect.Effect<string, JiraMigrationMutationError>
  awaitReset: (
    input: JiraMigrationCleanupCommand &
      Readonly<{ cleanupExecutionId: string }>
  ) => Effect.Effect<
    Readonly<{ fence: AttemptFence; revision: number }>,
    JiraMigrationMutationError
  >
}>
export type JiraMigrationMaterializationCommands = Readonly<{
  unresolvedFailedAttachments: (
    input: AttemptFence & Readonly<{ expectedRevision: number }>
  ) => Effect.Effect<ReadonlyArray<string>, JiraMigrationMutationError>
}>
export type JiraMigrationRunCommand = Readonly<{
  owner: ProjectionOwner
  migrationId: string
  expectedRevision: number
}>
export const submitJiraMigrationRun = Effect.fn("submitJiraMigrationRun")(
  function* (input: JiraMigrationRunCommand) {
    const projection = yield* JiraMigrationProjection
    const sql = yield* SqlClient.SqlClient
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const row = yield* projection.owned(input.owner, input.migrationId)
          if (row.revision !== input.expectedRevision || !fenceFor(row))
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const checkpoint = yield* decodeCheckpoint(row.checkpoint)
          const gate = checkpoint.currentGate
          if (
            !gate ||
            (gate._tag === "StartImport"
              ? gate.scanRevision !== row.scanRevision
              : gate.failureSequence !== row.failureSequence)
          )
            return yield* new Validation({
              reason: "jira_migration_run_not_allowed"
            })
          const accepted = yield* projection.transition({
            ...input,
            action: "run"
          })
          if (gate._tag === "StartImport") {
            const deferred = startImportDeferred(gate.scanRevision)
            const token = DurableDeferred.tokenFromExecutionId(deferred, {
              workflow: JiraMigrationWorkflow,
              executionId: row.workflowExecutionId!
            })
            yield* DurableDeferred.succeed(deferred, {
              token,
              value: { scanRevision: gate.scanRevision }
            })
          } else {
            const deferred = retryDeferred(gate.failureSequence)
            const token = DurableDeferred.tokenFromExecutionId(deferred, {
              workflow: JiraMigrationWorkflow,
              executionId: row.workflowExecutionId!
            })
            yield* DurableDeferred.succeed(deferred, {
              token,
              value: { failureSequence: gate.failureSequence }
            })
          }
          return accepted
        })
      )
      .pipe(
        Effect.catchTag("SqlError", () =>
          Effect.fail(new JiraError({ reason: "server_error" }))
        )
      )
  }
)

export const JiraMigrationsDurableLive = (
  cleanup: JiraMigrationCleanupCommands,
  materialization: JiraMigrationMaterializationCommands
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const projection = yield* JiraMigrationProjection
      const sql = yield* SqlClient.SqlClient
      const engine = yield* WorkflowEngine.WorkflowEngine
      const provide = <A, E>(
        effect: Effect.Effect<
          A,
          E,
          | JiraMigrationProjection
          | SqlClient.SqlClient
          | WorkflowEngine.WorkflowEngine
        >
      ) =>
        effect.pipe(
          Effect.provideService(JiraMigrationProjection, projection),
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
        )
      const run: JiraMigrationsShape["run"] = Effect.fn("JiraMigrations.run")(
        function* (organizationId, userId, migrationId, expectedRevision) {
          const owner = { organizationId, userId }
          const accepted = yield* provide(
            submitJiraMigrationRun({ owner, migrationId, expectedRevision })
          )
          const observed = yield* projection.owned(owner, migrationId).pipe(
            Effect.repeat({
              while: (row) => row.revision <= accepted.revision,
              schedule: Schedule.spaced("20 millis")
            }),
            Effect.timeoutOption("2 seconds")
          )
          const current = Option.isSome(observed)
            ? observed.value
            : yield* projection.owned(owner, migrationId)
          return yield* projection.toDetail(current)
        }
      )
      const cancel: JiraMigrationsShape["cancel"] = Effect.fn(
        "JiraMigrations.cancel"
      )(function* (organizationId, userId, migrationId, expectedRevision) {
        const owner = { organizationId, userId }
        const row = yield* projection.owned(owner, migrationId)
        const fence = fenceFor(row)
        if (!fence)
          return yield* new Conflict({
            reason: "jira_migration_revision_conflict"
          })
        yield* projection.transition({
          owner,
          migrationId,
          expectedRevision,
          action: "cancel"
        })
        yield* provide(
          JiraMigrationWorkflow.interrupt(fence.workflowExecutionId)
        )
        yield* projection.finalizeInterrupted(fence)
        return yield* projection
          .owned(owner, migrationId)
          .pipe(Effect.flatMap(projection.toDetail))
      })
      const discard: JiraMigrationsShape["discard"] = Effect.fn(
        "JiraMigrations.discard"
      )(
        function* (organizationId, userId, migrationId) {
          const row = yield* projection.owned(
            { organizationId, userId },
            migrationId
          )
          const fence = fenceFor(row)
          if (!fence || !projection.actionsFor(row).canDiscard)
            return yield* new Validation({
              reason: "jira_migration_discard_not_allowed"
            })
          yield* cleanup.start({
            ...fence,
            expectedRevision: row.revision,
            mode: "discard"
          })
        },
        Effect.catchTag("Conflict", () =>
          Effect.fail(
            new Validation({ reason: "jira_migration_discard_not_allowed" })
          )
        ),
        Effect.catchTag("JiraError", (error) =>
          Effect.logError("Jira migration cleanup submission failed", {
            reason: error.reason
          }).pipe(
            Effect.andThen(
              Effect.fail(
                new Validation({ reason: "jira_migration_cleanup_failed" })
              )
            )
          )
        )
      )
      const prepareRescan = Effect.fn("JiraMigrations.prepareRescan")(
        function* (row: JiraMigrationRow) {
          const fence = fenceFor(row)
          if (!fence)
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const command = {
            ...fence,
            expectedRevision: row.revision,
            mode: "reset_import" as const
          }
          const cleanupExecutionId = yield* cleanup.start(command)
          const reset = yield* cleanup.awaitReset({
            ...command,
            cleanupExecutionId
          })
          const current = yield* projection.owned(
            { organizationId: row.organizationId, userId: row.initiatedBy },
            row.id
          )
          if (
            current.revision !== reset.revision ||
            current.workflowExecutionId !== reset.fence.workflowExecutionId ||
            current.workflowAttempt !== reset.fence.workflowAttempt ||
            current.id !== reset.fence.migrationId ||
            current.destinationProjectId !== null ||
            current.cleanupExecutionId !== null
          )
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          return current
        }
      )
      const configure: JiraMigrationsShape["configure"] = Effect.fn(
        "JiraMigrations.configure"
      )(
        function* (
          organizationId,
          userId,
          migrationId,
          expectedRevision,
          configuration
        ) {
          const owner = { organizationId, userId }
          const row = yield* projection.owned(owner, migrationId)
          const fence = fenceFor(row)
          if (!fence || row.revision !== expectedRevision)
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const unresolvedFailedAttachmentIds =
            row.destinationProjectId === null
              ? undefined
              : yield* materialization.unresolvedFailedAttachments({
                  ...fence,
                  expectedRevision
                })
          return yield* projection.saveConfiguration({
            owner,
            migrationId,
            expectedRevision,
            configuration,
            unresolvedFailedAttachmentIds
          })
        }
      )
      return JiraMigrationsWorkflowLive(
        { run, cancel, discard },
        prepareRescan,
        configure
      )
    })
  )
