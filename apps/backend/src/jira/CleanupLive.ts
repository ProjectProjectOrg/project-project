import { Db } from "@pp/db"
import {
  attachmentIndex,
  jiraMigration,
  organization,
  projectIndex
} from "@pp/db/schema"
import {
  JiraMigrationCleanupFailure,
  type JiraCleanupActivities,
  type JiraMigrationCleanupPayload
} from "@pp/integration-jira/CleanupWorkflow"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import * as MigrationWorkflow from "@pp/integration-jira/MigrationWorkflow"
import type * as Markdown from "@pp/server-core/markdown/Markdown"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import { and, eq, isNull } from "drizzle-orm"
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import type * as Path from "effect/Path"
import type * as WorkflowEngine from "effect/workflow/WorkflowEngine"

import { verifyJiraPermanentArchive } from "./PublicationLive"

const cleanupFailure = (reason: string) =>
  JiraMigrationCleanupFailure.make({ reason, retryable: true })

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
      if (state.row.destinationProjectId === null) return state
      const [project] = yield* db
        .select()
        .from(projectIndex)
        .where(eq(projectIndex.id, state.row.destinationProjectId))
        .limit(1)
        .pipe(
          Effect.mapError(() => cleanupFailure("cleanup-project-read-failed"))
        )
      if (
        project &&
        (project.organizationId !== state.row.organizationId ||
          project.slug !== state.row.destinationProjectSlug ||
          project.publishedAt !== null)
      )
        return yield* Effect.fail(cleanupFailure("cleanup-project-conflict"))
      return state
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
      const { row, orgSlug } = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      if (row.destinationProjectId === null) return
      const attachments = yield* db
        .select({ objectKey: attachmentIndex.objectKey })
        .from(attachmentIndex)
        .where(
          and(
            eq(attachmentIndex.organizationId, row.organizationId),
            eq(attachmentIndex.projectId, row.destinationProjectId),
            eq(attachmentIndex.status, "pending")
          )
        )
        .pipe(
          Effect.mapError(() =>
            cleanupFailure("cleanup-attachment-read-failed")
          )
        )
      if (attachments.length === 0) return
      const connection = yield* orgStorage
        .requireConnection(orgSlug)
        .pipe(
          Effect.mapError(() => cleanupFailure("cleanup-storage-unavailable"))
        )
      yield* Effect.forEach(
        attachments,
        (attachment) =>
          s3
            .deleteObject(connection, attachment.objectKey)
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
      const { row } = yield* verifyUnpublishedDestination(payload, executionId)
      if (row.destinationProjectId === null) return
      yield* db
        .delete(attachmentIndex)
        .where(
          and(
            eq(attachmentIndex.organizationId, row.organizationId),
            eq(attachmentIndex.projectId, row.destinationProjectId),
            eq(attachmentIndex.status, "pending")
          )
        )
        .pipe(
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
      const { row, orgSlug } = yield* verifyUnpublishedDestination(
        payload,
        executionId
      )
      if (row.destinationProjectSlug === null) return
      yield* projectDocs
        .removeDir(orgSlug, row.destinationProjectSlug)
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
      const { row } = yield* verifyUnpublishedDestination(payload, executionId)
      if (row.destinationProjectId === null) return
      yield* db
        .delete(projectIndex)
        .where(
          and(
            eq(projectIndex.id, row.destinationProjectId),
            eq(projectIndex.organizationId, row.organizationId),
            isNull(projectIndex.publishedAt)
          )
        )
        .pipe(
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
