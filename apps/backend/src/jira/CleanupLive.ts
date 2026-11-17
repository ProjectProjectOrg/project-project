import { Db } from "@pp/db"
import { jiraMigration, organization } from "@pp/db/schema"
import {
  JiraMigrationCleanupFailure,
  type JiraCleanupActivities,
  type JiraMigrationCleanupPayload
} from "@pp/integration-jira/CleanupWorkflow"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import * as MigrationWorkflow from "@pp/integration-jira/MigrationWorkflow"
import type * as Markdown from "@pp/server-core/markdown/Markdown"
import * as HiddenProject from "@pp/server-core/projects/hiddenProject"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import type * as Path from "effect/Path"
import type * as WorkflowEngine from "effect/workflow/WorkflowEngine"

import { verifyJiraPermanentArchive } from "./PublicationLive"

const cleanupFailure = (reason: string) =>
  JiraMigrationCleanupFailure.make({ reason, retryable: true })

const destinationOf = (
  state: Readonly<{ row: typeof jiraMigration.$inferSelect; orgSlug: string }>
) => ({
  organizationId: state.row.organizationId,
  orgSlug: state.orgSlug,
  projectId: state.row.destinationProjectId,
  projectSlug: state.row.destinationProjectSlug
})

export const makeJiraCleanupActivities = Effect.gen(function* () {
  const db = yield* Db
  const projection = yield* MigrationProjection.JiraMigrationProjection
  const artifacts = yield* MigrationArtifacts.JiraMigrationArtifacts
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage
  const projectDocs = yield* ProjectDocs.ProjectDocs

  const readState = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const [state] = yield* db
        .select({ row: jiraMigration, orgSlug: organization.slug })
        .from(jiraMigration)
        .innerJoin(
          organization,
          eq(organization.id, jiraMigration.organizationId)
        )
        .where(eq(jiraMigration.id, payload.migrationId))
        .limit(1)
        .pipe(Effect.mapError(() => cleanupFailure("cleanup-read-failed")))
      if (
        !state ||
        state.row.cleanupExecutionId !== executionId ||
        state.row.revision < payload.cleanupGeneration
      )
        return yield* Effect.fail(cleanupFailure("cleanup-claim-lost"))
      const checkpoint = yield* MigrationProjection.decodeCheckpoint(
        state.row.checkpoint
      ).pipe(
        Effect.mapError(() => cleanupFailure("cleanup-checkpoint-invalid"))
      )
      if (checkpoint.remoteWritesMayStillCommit)
        return yield* Effect.fail(cleanupFailure("cleanup-writes-uncertain"))
      return state
    })

  const verifyUnpublishedDestination = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const state = yield* readState(payload, executionId)
      const unpublished = yield* HiddenProject.isUnpublishedDestination(
        destinationOf(state)
      ).pipe(
        Effect.provideService(Db, db),
        Effect.mapError(() => cleanupFailure("cleanup-project-read-failed"))
      )
      if (!unpublished)
        return yield* Effect.fail(cleanupFailure("cleanup-project-conflict"))
      return destinationOf(state)
    })

  const claim = (payload: JiraMigrationCleanupPayload, executionId: string) =>
    Effect.gen(function* () {
      const [row] = yield* db
        .select()
        .from(jiraMigration)
        .where(eq(jiraMigration.id, payload.migrationId))
        .limit(1)
        .pipe(Effect.mapError(() => cleanupFailure("cleanup-read-failed")))
      const fence = row && MigrationProjection.fenceFor(row)
      if (!fence) return false
      const claimed = yield* projection
        .claimCleanup(fence, {
          expectedRevision: payload.cleanupGeneration - 1,
          executionId,
          mode: payload.mode
        })
        .pipe(Effect.mapError(() => cleanupFailure("cleanup-claim-failed")))
      if (claimed && (payload.mode === "discard" || payload.mode === "expire"))
        yield* MigrationWorkflow.JiraMigrationWorkflow.interrupt(
          fence.workflowExecutionId
        ).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "Jira migration interrupt before cleanup failed",
              {
                migrationId: payload.migrationId,
                cause
              }
            )
          )
        )
      return claimed
    })

  const deleteCopiedObjects = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const destination = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      const objectKeys = yield* HiddenProject.pendingObjectKeys(
        destination
      ).pipe(
        Effect.provideService(Db, db),
        Effect.mapError(() => cleanupFailure("cleanup-attachment-read-failed"))
      )
      if (objectKeys.length === 0) return
      const connection = yield* orgStorage
        .requireConnection(destination.orgSlug)
        .pipe(
          Effect.mapError(() => cleanupFailure("cleanup-storage-unavailable"))
        )
      yield* Effect.forEach(
        objectKeys,
        (objectKey) =>
          s3
            .deleteObject(connection, objectKey)
            .pipe(
              Effect.mapError(() =>
                cleanupFailure("cleanup-object-delete-failed")
              )
            ),
        { concurrency: 4, discard: true }
      )
    })

  const deletePendingAttachments = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const destination = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      yield* HiddenProject.deletePendingAttachments(destination).pipe(
        Effect.provideService(Db, db),
        Effect.mapError(() =>
          cleanupFailure("cleanup-attachment-delete-failed")
        )
      )
    })

  const deleteHiddenDocuments = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const destination = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      if (destination.projectSlug === null) return
      yield* projectDocs
        .removeDir(destination.orgSlug, destination.projectSlug)
        .pipe(
          Effect.mapError(() =>
            cleanupFailure("cleanup-document-delete-failed")
          )
        )
    })

  const deleteHiddenProject = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const destination = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      yield* HiddenProject.deleteHiddenProjectRow(destination).pipe(
        Effect.provideService(Db, db),
        Effect.mapError(() => cleanupFailure("cleanup-project-delete-failed"))
      )
    })

  const deletePrivateStaging = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const { row, orgSlug } = yield* readState(payload, executionId)
      yield* artifacts
        .deletePrefix(orgSlug, `${row.stagingPrefix}/`)
        .pipe(
          Effect.mapError(() => cleanupFailure("cleanup-staging-delete-failed"))
        )
    })

  const verifyPermanentArchive = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      const { row, orgSlug } = yield* readState(payload, executionId)
      const fence = MigrationProjection.fenceFor(row)
      if (!fence)
        return yield* Effect.fail(cleanupFailure("cleanup-claim-lost"))
      yield* verifyJiraPermanentArchive(fence, orgSlug, artifacts).pipe(
        Effect.provideService(Db, db),
        Effect.mapError(() => cleanupFailure("cleanup-archive-invalid"))
      )
    })

  const complete = (
    payload: JiraMigrationCleanupPayload,
    executionId: string
  ) =>
    Effect.gen(function* () {
      if (payload.mode === "discard" || payload.mode === "expire") {
        const [existing] = yield* db
          .select({ id: jiraMigration.id })
          .from(jiraMigration)
          .where(eq(jiraMigration.id, payload.migrationId))
          .limit(1)
          .pipe(Effect.mapError(() => cleanupFailure("cleanup-read-failed")))
        if (!existing) return
      }
      const { row } = yield* readState(payload, executionId)
      const fence = MigrationProjection.fenceFor(row)
      if (!fence)
        return yield* Effect.fail(cleanupFailure("cleanup-claim-lost"))
      const completed = yield* Match.value(payload.mode)
        .pipe(
          Match.when("reset_import", () =>
            projection.completeResetCleanup(fence, executionId)
          ),
          Match.when("post_success", () =>
            projection.completePostSuccessCleanup(fence, executionId)
          ),
          Match.orElse(() => projection.deleteAfterCleanup(fence, executionId))
        )
        .pipe(
          Effect.mapError(() => cleanupFailure("cleanup-completion-failed"))
        )
      if (!completed)
        return yield* Effect.fail(cleanupFailure("cleanup-completion-rejected"))
    })

  const release = (payload: JiraMigrationCleanupPayload, executionId: string) =>
    Effect.gen(function* () {
      const [row] = yield* db
        .select()
        .from(jiraMigration)
        .where(eq(jiraMigration.id, payload.migrationId))
        .limit(1)
      const fence = row && MigrationProjection.fenceFor(row)
      if (!fence) return
      yield* projection.releaseCleanup(fence, executionId, payload.mode)
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Jira cleanup release failed", cause)
      )
    )

  const activities: JiraCleanupActivities<
    | WorkflowEngine.WorkflowEngine
    | FileSystem.FileSystem
    | Markdown.Markdown
    | Path.Path
  > = {
    claim,
    verifyPermanentArchive,
    deleteHiddenProject,
    deletePendingAttachments,
    deleteCopiedObjects,
    deleteHiddenDocuments,
    deletePrivateStaging,
    complete,
    release
  }
  return activities
})
