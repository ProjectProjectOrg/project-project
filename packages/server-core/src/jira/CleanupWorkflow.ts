import { Db } from "@pp/db"
import { jiraMigration } from "@pp/db/schema"
import { Conflict, JiraError } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { Activity, Workflow } from "effect/unstable/workflow"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"

import { fenceFor } from "./MigrationProjection"
import type {
  JiraMigrationCleanupCommand,
  JiraMigrationCleanupCommands
} from "./Migrations"

export const JiraMigrationCleanupFailure = Schema.TaggedStruct(
  "JiraMigrationCleanupFailure",
  {
    reason: Schema.NonEmptyString,
    retryable: Schema.Boolean
  }
)
export type JiraMigrationCleanupFailure =
  typeof JiraMigrationCleanupFailure.Type

export const JiraMigrationCleanupPayload = Schema.Struct({
  migrationId: Schema.NonEmptyString,
  mode: Schema.Literals(["reset_import", "discard", "expire", "post_success"]),
  cleanupGeneration: Schema.Int
})
export type JiraMigrationCleanupPayload =
  typeof JiraMigrationCleanupPayload.Type

export const JiraMigrationCleanupWorkflow = Workflow.make(
  "ProjectProject/JiraMigrationCleanup/v1",
  {
    payload: JiraMigrationCleanupPayload,
    success: Schema.Void,
    error: JiraMigrationCleanupFailure,
    idempotencyKey: ({ migrationId, mode, cleanupGeneration }) =>
      `${migrationId}:${mode}:${cleanupGeneration}`
  }
)

export type JiraCleanupStage<R> = (
  payload: JiraMigrationCleanupPayload,
  executionId: string
) => Effect.Effect<void, JiraMigrationCleanupFailure, R>

export type JiraCleanupActivities<R> = Readonly<{
  claim: (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) => Effect.Effect<boolean, JiraMigrationCleanupFailure, R>
  verifyPermanentArchive: JiraCleanupStage<R>
  deleteHiddenProject: JiraCleanupStage<R>
  deletePendingAttachments: JiraCleanupStage<R>
  deleteCopiedObjects: JiraCleanupStage<R>
  deleteHiddenDocuments: JiraCleanupStage<R>
  deletePrivateStaging: JiraCleanupStage<R>
  complete: JiraCleanupStage<R>
  release: (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) => Effect.Effect<void, never, R>
}>

export const jiraCleanupActivityName = (
  payload: JiraMigrationCleanupPayload,
  stage: string
) => `v1/cleanup/${payload.mode}/${payload.cleanupGeneration}/${stage}`

export const makeJiraMigrationCleanupWorkflow = <R>(
  activities: JiraCleanupActivities<R>
) =>
  JiraMigrationCleanupWorkflow.toLayer((payload, executionId) =>
    Effect.gen(function* () {
      yield* Workflow.addFinalizer((exit) =>
        Exit.isFailure(exit)
          ? Activity.make({
              name: jiraCleanupActivityName(payload, "release"),
              success: Schema.Void,
              execute: activities.release(payload, executionId)
            })
          : Effect.void
      )
      const claimed = yield* Activity.make({
        name: jiraCleanupActivityName(payload, "claim"),
        success: Schema.Boolean,
        error: JiraMigrationCleanupFailure,
        execute: activities.claim(payload, executionId)
      })
      if (!claimed)
        return yield* Effect.fail(
          JiraMigrationCleanupFailure.make({
            reason: "cleanup-claim-lost",
            retryable: true
          })
        )
      const run = (
        name: string,
        execute: Effect.Effect<void, JiraMigrationCleanupFailure, R>
      ) =>
        Activity.make({
          name: jiraCleanupActivityName(payload, name),
          success: Schema.Void,
          error: JiraMigrationCleanupFailure,
          execute
        })
      if (payload.mode === "post_success") {
        yield* run(
          "verify-archive",
          activities.verifyPermanentArchive(payload, executionId)
        )
        yield* run(
          "private-staging",
          activities.deletePrivateStaging(payload, executionId)
        )
      } else {
        yield* run(
          "copied-objects",
          activities.deleteCopiedObjects(payload, executionId)
        )
        yield* run(
          "pending-attachments",
          activities.deletePendingAttachments(payload, executionId)
        )
        yield* run(
          "hidden-documents",
          activities.deleteHiddenDocuments(payload, executionId)
        )
        yield* run(
          "hidden-project",
          activities.deleteHiddenProject(payload, executionId)
        )
        if (payload.mode !== "reset_import")
          yield* run(
            "private-staging",
            activities.deletePrivateStaging(payload, executionId)
          )
      }
      yield* run("complete", activities.complete(payload, executionId))
    })
  )

export const makeJiraCleanupCommands = Effect.gen(function* () {
  const db = yield* Db
  const engine = yield* WorkflowEngine.WorkflowEngine
  const payloadFor = (input: JiraMigrationCleanupCommand) => ({
    migrationId: input.migrationId,
    mode: input.mode,
    cleanupGeneration: input.expectedRevision + 1
  })
  const provideEngine = <A, E>(
    effect: Effect.Effect<A, E, WorkflowEngine.WorkflowEngine>
  ) => Effect.provideService(effect, WorkflowEngine.WorkflowEngine, engine)
  const start: JiraMigrationCleanupCommands["start"] = (input) =>
    provideEngine(
      JiraMigrationCleanupWorkflow.execute(payloadFor(input), {
        discard: true
      })
    )
  const awaitReset: JiraMigrationCleanupCommands["awaitReset"] = (input) =>
    Effect.gen(function* () {
      const payload = payloadFor(input)
      const executionId = yield* provideEngine(
        JiraMigrationCleanupWorkflow.execute(payload, { discard: true })
      )
      if (executionId !== input.cleanupExecutionId)
        return yield* new Conflict({
          reason: "jira_migration_revision_conflict"
        })
      yield* provideEngine(JiraMigrationCleanupWorkflow.execute(payload)).pipe(
        Effect.mapError(() => new JiraError({ reason: "server_error" }))
      )
      const [row] = yield* db
        .select()
        .from(jiraMigration)
        .where(eq(jiraMigration.id, input.migrationId))
        .limit(1)
        .pipe(Effect.mapError(() => new JiraError({ reason: "server_error" })))
      const fence = row && fenceFor(row)
      if (
        !row ||
        !fence ||
        fence.workflowExecutionId !== input.workflowExecutionId ||
        fence.workflowAttempt !== input.workflowAttempt ||
        row.cleanupExecutionId !== null ||
        row.destinationProjectId !== null ||
        row.revision < payload.cleanupGeneration + 1
      )
        return yield* new Conflict({
          reason: "jira_migration_revision_conflict"
        })
      return { fence, revision: row.revision }
    })
  return { start, awaitReset } satisfies JiraMigrationCleanupCommands
})
