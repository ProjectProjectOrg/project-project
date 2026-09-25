import { Db } from "@pp/db"
import { member, organization, jiraMigration, user } from "@pp/db/schema"
import { JiraError } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

import { OrgStorage } from "../storage/OrgStorage"
import { S3Storage } from "../storage/S3Storage"
import * as CleanupWorkflow from "./CleanupWorkflow"
import { JiraClient } from "./Client"
import {
  buildJiraPreparedPublicationFromSnapshot,
  loadJiraPreparedPublication,
  loadJiraPublicationPlan,
  persistJiraPreparedPublication,
  publishJiraMigrationAtomically
} from "./Import"
import * as JiraImport from "./Import"
import {
  materializeJiraPreparedPublication,
  prepareJiraPublicationReference,
  publishJiraPreparedPublication,
  type MigrationActivityInput
} from "./MigrationActivities"
import { JiraMigrationArtifacts } from "./MigrationArtifacts"
import {
  decodeCheckpoint,
  JiraMigrationProjection,
  type AttemptFence
} from "./MigrationProjection"
import {
  JiraMigrationWorkflowFailure,
  withJiraRemoteWriteIntent
} from "./MigrationWorkflow"
import { finalizeJiraMigrationAttempt, scanSnapshot } from "./MigrationWorkflow"
import * as MigrationWorkflow from "./MigrationWorkflow"
import { JiraPublicationInvalid } from "./Preflight"

const fenceForInput = (input: MigrationActivityInput): AttemptFence => ({
  migrationId:
    input.payload.command._tag === "Create"
      ? input.executionId
      : input.payload.command.migrationId,
  workflowExecutionId: input.executionId,
  workflowAttempt:
    input.payload.command._tag === "Create"
      ? 1
      : input.payload.command.workflowAttempt
})

const failure = (reason: string, retryable: boolean) =>
  JiraMigrationWorkflowFailure.make({ reason, retryable })

const materializationFailure = (error: unknown) =>
  failure(
    Schema.is(JiraPublicationInvalid)(error)
      ? "jira_migration_publication_invalid"
      : "jira_migration_materialization_failed",
    !Schema.is(JiraPublicationInvalid)(error)
  )

export const preparationFailure = (error: unknown) =>
  Schema.is(JiraPublicationInvalid)(error)
    ? failure("jira_migration_preparation_invalid", true)
    : materializationFailure(error)

export const makeJiraProductionActivities = Effect.gen(function* () {
  const db = yield* Db
  const projection = yield* JiraMigrationProjection
  const jira = yield* JiraClient
  const artifacts = yield* JiraMigrationArtifacts
  const orgStorage = yield* OrgStorage
  const s3 = yield* S3Storage
  const cleanup = yield* CleanupWorkflow.makeJiraCleanupCommands

  const readAttempt = (fence: AttemptFence) =>
    Effect.gen(function* () {
      const [current] = yield* db
        .select({ row: jiraMigration, orgSlug: organization.slug })
        .from(jiraMigration)
        .innerJoin(
          organization,
          eq(organization.id, jiraMigration.organizationId)
        )
        .where(eq(jiraMigration.id, fence.migrationId))
        .limit(1)
        .pipe(
          Effect.mapError(() => failure("jira_migration_database_failed", true))
        )
      if (
        !current ||
        current.row.workflowExecutionId !== fence.workflowExecutionId ||
        current.row.workflowAttempt !== fence.workflowAttempt
      )
        return yield* Effect.fail(failure("jira_migration_superseded", false))
      return current
    })

  const scan = (input: MigrationActivityInput) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const { row, orgSlug } = yield* readAttempt(fence)
      const scannedAt = DateTime.formatIso(yield* DateTime.now)
      const identityOptions = db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          imageUrl: user.image
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, row.organizationId))
        .pipe(
          Effect.map((members) =>
            members.map((member) => ({
              ...member,
              name: member.name.trim() || member.email
            }))
          ),
          Effect.mapError(() => new JiraError({ reason: "server_error" }))
        )
      yield* scanSnapshot(
        {
          ...fence,
          scanRevision: row.scanRevision,
          orgSlug,
          userId: row.initiatedBy,
          cloudId: row.sourceCloudId,
          projectId: row.sourceProjectId,
          siteName: row.sourceSiteName,
          siteUrl: row.sourceSiteUrl,
          scannedAt
        },
        MigrationWorkflow.makeProjectionScanDependencies(
          projection,
          {
            client: jira,
            artifacts,
            identityOptions
          },
          fence
        )
      )
    })

  const materialize = (input: MigrationActivityInput, operationTry = 0) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const { row, orgSlug } = yield* readAttempt(fence)
      if (!["migrating", "succeeded"].includes(row.status))
        return yield* Effect.fail(failure("jira_migration_superseded", false))
      const checkpoint = yield* decodeCheckpoint(row.checkpoint).pipe(
        Effect.mapError(materializationFailure)
      )
      const manifestRef = checkpoint.scan?.manifest
      const accepted = checkpoint.acceptedConfiguration
      if (!manifestRef || !accepted)
        return yield* Effect.fail(
          failure("jira_migration_snapshot_missing", false)
        )
      const connection = yield* orgStorage
        .requireConnection(orgSlug)
        .pipe(Effect.mapError(materializationFailure))
      const preparedRef = yield* prepareJiraPublicationReference(
        {
          scanRevision: row.scanRevision,
          configurationRevision: accepted.configurationRevision,
          operationTry
        },
        {
          error: JiraMigrationWorkflowFailure,
          prepare: Effect.gen(function* () {
            const prepared = yield* buildJiraPreparedPublicationFromSnapshot(
              {
                fence,
                manifestRef,
                configurationRevision: accepted.configurationRevision,
                configuration: accepted.configuration,
                migrationCreatedAt: row.createdAt.toISOString(),
                organizationId: row.organizationId,
                orgSlug,
                ownerId: row.initiatedBy,
                connection
              },
              artifacts
            ).pipe(Effect.mapError(preparationFailure))
            return yield* withJiraRemoteWriteIntent(
              projection,
              fence,
              persistJiraPreparedPublication(prepared, artifacts).pipe(
                Effect.mapError(materializationFailure)
              )
            )
          })
        }
      )
      const prepared = yield* loadJiraPreparedPublication(
        orgSlug,
        preparedRef,
        artifacts
      ).pipe(Effect.mapError(materializationFailure))
      if (
        prepared.manifest.workflow.executionId !== fence.workflowExecutionId ||
        prepared.manifest.workflow.attempt !== fence.workflowAttempt
      )
        return yield* Effect.fail(
          failure("jira_migration_prepared_attempt_conflict", false)
        )
      const dependencies = JiraImport.makeJiraMaterializationDependencies(
        prepared,
        fence,
        {
          connection,
          jira,
          s3,
          artifacts
        }
      )
      const receipt = (sourceAttachmentId: string, failed: boolean) =>
        Effect.gen(function* () {
          const recorded = yield* (
            failed
              ? projection.recordAttachmentFailure(
                  fence,
                  accepted.configurationRevision,
                  sourceAttachmentId
                )
              : projection.recordAttachmentSuccess(
                  fence,
                  accepted.configurationRevision,
                  sourceAttachmentId
                )
          ).pipe(Effect.mapError(materializationFailure))
          if (!recorded)
            return yield* Effect.fail(
              failure("jira_migration_superseded", false)
            )
        })
      return yield* withJiraRemoteWriteIntent(
        projection,
        fence,
        materializeJiraPreparedPublication(
          {
            scanRevision: row.scanRevision,
            configurationRevision: accepted.configurationRevision,
            operationTry,
            attachments: prepared.attachments
          },
          {
            ...dependencies,
            copyAttachment: (attachment) =>
              dependencies.copyAttachment(attachment).pipe(
                Effect.tapError(() =>
                  attachment.decision === "copy"
                    ? receipt(attachment.sourceAttachmentId, true)
                    : Effect.void
                ),
                Effect.tap(() => receipt(attachment.sourceAttachmentId, false))
              )
          }
        )
      )
    })

  const publish = (
    input: MigrationActivityInput,
    ready: import("./MigrationActivities").JiraReadyPublication,
    operationTry = 0
  ) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const { orgSlug } = yield* readAttempt(fence)
      yield* publishJiraPreparedPublication(ready, {
        error: JiraMigrationWorkflowFailure,
        operationTry,
        publish: (planRef, verified) =>
          Effect.gen(function* () {
            const { plan, publicationRevision } =
              yield* loadJiraPublicationPlan(orgSlug, planRef, artifacts)
            if (plan.project.id !== ready.projectId)
              return yield* new JiraPublicationInvalid({
                reasons: ["publication-project-conflict"]
              })
            return yield* publishJiraMigrationAtomically({
              fence,
              planRef,
              plan,
              publicationRevision,
              verified
            })
          }).pipe(Effect.mapError(materializationFailure))
      })
    })

  const finalize = (
    input: Readonly<{
      executionId: string
      exit: import("effect/Exit").Exit<unknown, unknown>
    }>
  ) =>
    Effect.gen(function* () {
      const [row] = yield* db
        .select()
        .from(jiraMigration)
        .where(eq(jiraMigration.workflowExecutionId, input.executionId))
        .limit(1)
      if (!row) return
      if (Exit.isSuccess(input.exit) && row.status === "succeeded") {
        yield* cleanup
          .start({
            migrationId: row.id,
            workflowExecutionId: input.executionId,
            workflowAttempt: row.workflowAttempt,
            expectedRevision: row.revision,
            mode: "post_success"
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logError(
                "Jira post-success cleanup submission failed",
                cause
              )
            )
          )
        return
      }
      yield* finalizeJiraMigrationAttempt(
        projection,
        {
          migrationId: row.id,
          workflowExecutionId: input.executionId,
          workflowAttempt: row.workflowAttempt
        },
        input.exit
      )
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Jira migration finalizer failed", cause)
      )
    )

  return MigrationWorkflow.makeProjectionMigrationActivities(
    projection,
    finalize,
    scan,
    materialize,
    publish
  )
})
