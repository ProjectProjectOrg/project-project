import { Db } from "@pp/db"
import { member, organization, jiraMigration, user } from "@pp/db/schema"
import * as CleanupWorkflow from "@pp/integration-jira/CleanupWorkflow"
import * as Client from "@pp/integration-jira/Client"
import {
  activityName,
  beginImportStage,
  materializeJiraPreparedPublication,
  prepareJiraPublicationReference,
  publishJiraPreparedPublication,
  type ImportUnitRunner,
  type JiraImportPhase,
  type MigrationActivityInput,
  withHeartbeat
} from "@pp/integration-jira/MigrationActivities"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import {
  DATABASE_RETRY,
  JiraMigrationWorkflowFailure,
  finalizeJiraMigrationAttempt,
  scanSnapshot
} from "@pp/integration-jira/MigrationWorkflow"
import * as MigrationWorkflow from "@pp/integration-jira/MigrationWorkflow"
import { JiraPublicationInvalid } from "@pp/integration-jira/Preflight"
import {
  loadJiraPreparedPublication,
  loadJiraPublicationPlan,
  persistJiraPreparedPublication
} from "@pp/integration-jira/PublicationArtifacts"
import type * as Markdown from "@pp/server-core/markdown/Markdown"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import { JiraError } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { Activity } from "effect/workflow"
import type * as WorkflowEngine from "effect/workflow/WorkflowEngine"

import {
  buildJiraPreparedPublicationFromSnapshot,
  classifyMaterializationError,
  materializationFailure,
  publishJiraMigrationAtomically
} from "./PublicationLive"
import * as JiraImport from "./PublicationLive"

const isJiraPublicationInvalid = Schema.is(JiraPublicationInvalid)

type MaterializationServices =
  | Db
  | FileSystem.FileSystem
  | Path.Path
  | Markdown.Markdown

const fenceForInput = (
  input: MigrationActivityInput
): MigrationProjection.AttemptFence =>
  MigrationWorkflow.JiraMigrationWorkflowCommand.match(input.payload.command, {
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

const failure = (reason: string, retryable: boolean) =>
  JiraMigrationWorkflowFailure.make({ reason, retryable })

const superseded = () => failure("jira_migration_superseded", false)

const databaseFailure = () =>
  JiraMigrationWorkflowFailure.make({
    reason: "jira_migration_database_failed",
    retryable: true,
    transient: true
  })

export const preparationFailure = (
  error: Effect.Error<
    ReturnType<typeof buildJiraPreparedPublicationFromSnapshot>
  >
) =>
  isJiraPublicationInvalid(error)
    ? JiraMigrationWorkflowFailure.make({
        reason: "jira_migration_preparation_invalid",
        retryable: true,
        detail: error.reasons.join(", ")
      })
    : classifyMaterializationError(error)

const IMPORTABLE_STATUSES = new Set([
  "migrating",
  "succeeded",
  "failed",
  "reconnect_required"
])

export const makeJiraProductionActivities = Effect.gen(function* () {
  const db = yield* Db
  const projection = yield* MigrationProjection.JiraMigrationProjection
  const jira = yield* Client.JiraClient
  const artifacts = yield* MigrationArtifacts.JiraMigrationArtifacts
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage
  const cleanup = yield* CleanupWorkflow.makeJiraCleanupCommands

  const readAttempt = (fence: MigrationProjection.AttemptFence) =>
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
        .pipe(Effect.mapError(databaseFailure))
      if (
        !current ||
        current.row.workflowExecutionId !== fence.workflowExecutionId ||
        current.row.workflowAttempt !== fence.workflowAttempt
      )
        return yield* Effect.fail(superseded())
      return current
    })

  const scan = (input: MigrationActivityInput) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const { row, orgSlug } = yield* readAttempt(fence).pipe(
        Effect.retry({
          ...DATABASE_RETRY,
          while: (error) => error.transient === true
        })
      )
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

  const importActivity = <A, I>(
    name: string,
    success: Schema.Codec<A, I>,
    execute: Effect.Effect<
      A,
      MigrationWorkflow.JiraMigrationWorkflowFailureValue
    >
  ) =>
    Activity.make({
      name,
      success,
      error: JiraMigrationWorkflowFailure,
      execute
    })

  const beginStageFor =
    (fence: MigrationProjection.AttemptFence) =>
    (phase: JiraImportPhase, total: number) =>
      projection
        .recordImportProgress(fence, { phase, total })
        .pipe(Effect.mapError(databaseFailure), Effect.asVoid)

  const materialize = <R0>(
    input: MigrationActivityInput,
    unit: ImportUnitRunner<R0>
  ) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const context = yield* unit("import/context", () =>
        Effect.gen(function* () {
          const { row, orgSlug } = yield* readAttempt(fence)
          if (!IMPORTABLE_STATUSES.has(row.status))
            return yield* Effect.fail(superseded())
          const checkpoint = yield* MigrationProjection.decodeCheckpoint(
            row.checkpoint
          ).pipe(Effect.catch(materializationFailure))
          const manifestRef = checkpoint.scan?.manifest
          const accepted = checkpoint.acceptedConfiguration
          if (!manifestRef || !accepted)
            return yield* Effect.fail(
              failure("jira_migration_snapshot_missing", false)
            )
          const connection = yield* orgStorage
            .requireConnection(orgSlug)
            .pipe(Effect.catch(materializationFailure))
          return { row, orgSlug, manifestRef, accepted, connection }
        })
      )
      const { row, orgSlug, manifestRef, accepted, connection } = context
      const revisions = {
        scanRevision: row.scanRevision,
        configurationRevision: accepted.configurationRevision
      }
      const revisionPath = `${revisions.scanRevision}/${revisions.configurationRevision}`
      const writesAccepted = (accepted: boolean) =>
        accepted ? Effect.void : Effect.fail(superseded())
      const beginWrites = projection
        .beginRemoteWrites(fence)
        .pipe(Effect.mapError(databaseFailure), Effect.flatMap(writesAccepted))
      const resumeWrites = (operationKey: string) =>
        importActivity(
          activityName(["import", "resume-writes", operationKey]),
          Schema.Void,
          beginWrites
        )
      const beginStage = beginStageFor(fence)
      const keepAlive = projection.heartbeat(fence)
      const advance = projection
        .recordImportProgress(fence, { increment: 1 })
        .pipe(Effect.mapError(databaseFailure), Effect.asVoid)
      yield* unit(`import/begin-writes/${revisionPath}`, (operationTry) =>
        importActivity(
          activityName(["import", "begin-writes", revisionPath, operationTry]),
          Schema.Void,
          beginWrites
        )
      )
      yield* beginImportStage(
        unit,
        revisions,
        JiraMigrationWorkflowFailure,
        "import_prepare",
        2,
        beginStage
      )
      const preparedRef = yield* unit(
        `import/preflight/${revisionPath}`,
        (operationTry) =>
          prepareJiraPublicationReference(
            { ...revisions, operationTry },
            {
              error: JiraMigrationWorkflowFailure,
              prepare: withHeartbeat(
                Effect.gen(function* () {
                  const prepared =
                    yield* buildJiraPreparedPublicationFromSnapshot(
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
                    ).pipe(
                      Effect.mapError(preparationFailure),
                      Effect.tapError((preparation) =>
                        Effect.logWarning("Jira import preparation failed", {
                          reason: preparation.reason,
                          detail: preparation.detail
                        })
                      )
                    )
                  const ref = yield* persistJiraPreparedPublication(
                    prepared,
                    artifacts
                  ).pipe(Effect.catch(materializationFailure))
                  yield* advance
                  return ref
                }),
                keepAlive
              )
            }
          ),
        { onResume: resumeWrites }
      )
      const prepared = yield* unit(
        `import/load-prepared/${preparedRef.sha256}`,
        () =>
          loadJiraPreparedPublication(orgSlug, preparedRef, artifacts).pipe(
            Effect.catch(materializationFailure)
          )
      )
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
      const issueKeys = new Map(
        prepared.manifest.issues.map((issue) => [issue.id, issue.key])
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
          ).pipe(Effect.mapError(databaseFailure))
          if (!recorded) return yield* Effect.fail(superseded())
        })
      const ready = yield* materializeJiraPreparedPublication<
        (typeof prepared.attachments)[number],
        | MaterializationServices
        | WorkflowEngine.WorkflowEngine
        | WorkflowEngine.WorkflowInstance,
        R0
      >(
        {
          ...revisions,
          attachments: prepared.attachments
        },
        {
          ...dependencies,
          createHidden: dependencies.createHidden.pipe(
            Effect.tap(() => advance)
          ),
          copyAttachment: (attachment) =>
            dependencies.copyAttachment(attachment).pipe(
              Effect.tapError(() =>
                attachment.decision === "copy"
                  ? receipt(attachment.sourceAttachmentId, true)
                  : Effect.void
              ),
              Effect.tap((outcome) =>
                outcome.kind === "failed"
                  ? Effect.logWarning("Jira attachment skipped and recorded", {
                      issueKey:
                        issueKeys.get(attachment.issueId) ?? attachment.issueId,
                      filename: attachment.filename,
                      reason: outcome.reason
                    })
                  : Effect.void
              ),
              Effect.tap(() => receipt(attachment.sourceAttachmentId, false)),
              Effect.tap(() => advance)
            ),
          writeDocumentBatch: (planRef, ordinal) =>
            dependencies
              .writeDocumentBatch(planRef, ordinal)
              .pipe(Effect.tap(() => advance)),
          writeArchive: (planRef) =>
            dependencies.writeArchive(planRef).pipe(Effect.tap(() => advance)),
          writeReport: (planRef) =>
            dependencies.writeReport(planRef).pipe(Effect.tap(() => advance)),
          finalizePlan: (outcomes) =>
            withHeartbeat(dependencies.finalizePlan(outcomes), keepAlive),
          verify: (planRef) =>
            withHeartbeat(
              dependencies.verify(planRef).pipe(Effect.tap(() => advance)),
              keepAlive
            ),
          beginStage,
          resumeWrites
        },
        unit
      )
      yield* unit(`import/settle-writes/${revisionPath}`, (operationTry) =>
        importActivity(
          activityName(["import", "settle-writes", revisionPath, operationTry]),
          Schema.Void,
          projection
            .settleRemoteWrites(fence)
            .pipe(
              Effect.mapError(databaseFailure),
              Effect.flatMap(writesAccepted)
            )
        )
      )
      return ready
    })

  const publish = <R0>(
    input: MigrationActivityInput,
    ready: import("@pp/integration-jira/MigrationActivities").JiraReadyPublication,
    unit: ImportUnitRunner<R0>
  ) =>
    Effect.gen(function* () {
      const fence = fenceForInput(input)
      const { orgSlug, revisions } = yield* unit("import/publish-context", () =>
        Effect.gen(function* () {
          const { row, orgSlug } = yield* readAttempt(fence)
          const checkpoint = yield* MigrationProjection.decodeCheckpoint(
            row.checkpoint
          ).pipe(Effect.catch(materializationFailure))
          const accepted = checkpoint.acceptedConfiguration
          if (!accepted)
            return yield* Effect.fail(
              failure("jira_migration_snapshot_missing", false)
            )
          return {
            orgSlug,
            revisions: {
              scanRevision: row.scanRevision,
              configurationRevision: accepted.configurationRevision
            }
          }
        })
      )
      yield* beginImportStage(
        unit,
        revisions,
        JiraMigrationWorkflowFailure,
        "import_publish",
        1,
        beginStageFor(fence)
      )
      yield* publishJiraPreparedPublication(
        ready,
        {
          error: JiraMigrationWorkflowFailure,
          publish: (planRef, verified) =>
            Effect.gen(function* () {
              const { plan, publicationRevision } =
                yield* loadJiraPublicationPlan(orgSlug, planRef, artifacts)
              if (plan.project.id !== ready.projectId)
                return yield* new JiraPublicationInvalid({
                  reasons: ["publication-project-conflict"]
                })
              return yield* withHeartbeat(
                publishJiraMigrationAtomically({
                  fence,
                  planRef,
                  plan,
                  publicationRevision,
                  verified
                }),
                projection.heartbeat(fence)
              )
            }).pipe(Effect.catch(materializationFailure))
        },
        unit
      )
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
      Effect.retry(DATABASE_RETRY),
      Effect.catchCause((cause) =>
        Effect.logError(
          "Jira migration finalizer failed; the stall watchdog will settle it",
          cause
        )
      )
    )

  return MigrationWorkflow.makeProjectionMigrationActivities<MaterializationServices>(
    projection,
    finalize,
    scan,
    materialize,
    publish
  )
})
