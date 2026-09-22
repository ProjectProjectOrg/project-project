import * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import type * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import * as Workflow from "effect/unstable/workflow/Workflow"
import * as Effect from "effect/Effect"
import type { JiraMigrationProjectionShape } from "./MigrationProjection"
import * as Schema from "effect/Schema"
import {
  makeFinalizeMigrationActivity,
  makeStartMigrationActivity,
  type MigrationActivities
} from "./MigrationActivities"
import type { JiraMigrationSource } from "./Migrations"

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
      const identity = migrationIdentity(payload, executionId)
      yield* DurableDeferred.await(startImportDeferred(identity.scanRevision))
      return { migrationId: identity.migrationId }
    })
  )

export const makeProjectionMigrationActivities = (
  projection: JiraMigrationProjectionShape,
  finalize: MigrationActivities<WorkflowEngine.WorkflowEngine>["finalize"]
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
        if (row.supersededExecutionId !== null) {
          yield* JiraMigrationWorkflow.interrupt(row.supersededExecutionId)
        }
      }
    }).pipe(
      Effect.mapError((error) => ({
        _tag: "JiraMigrationWorkflowFailure" as const,
        reason: error.reason,
        retryable: error._tag === "JiraError"
      }))
    ),
  finalize
})
