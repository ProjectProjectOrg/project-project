import * as Clock from "effect/Clock"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { and, eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import {
  ATTACHMENT_MAX_BYTES,
  attachmentUrl,
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  extractAttachmentRefs,
  Forbidden,
  isRasterImageContentType,
  NotFound,
  StorageError,
  type Attachment
} from "@projectproject/shared"
import { attachmentIndex, projectIndex } from "../db/schema"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { Projects } from "../Services/Projects"
import { attachmentObjectKey, S3Storage } from "../Services/S3Storage"
import {
  Attachments,
  isServableStatus,
  planReap,
  planReconciliation,
  validateUploadRequest,
  type AttachmentsShape
} from "../Services/Attachments"

const mapS3Unavailable = (error: { reason: string }) =>
  new StorageError({ reason: error.reason })

export const AttachmentsLive = Layer.effect(
  Attachments,
  Effect.gen(function* () {
    const db = yield* Db
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage
    const projects = yield* Projects

    const requireProject = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const row = yield* db.query.projectIndex
          .findFirst({
            columns: { organizationId: true },
            where: eq(projectIndex.slug, slug)
          })
          .pipe(Effect.orDie)
        if (!row) return yield* new NotFound()
        return { organizationId: row.organizationId }
      })

    const toAttachment = (
      row: typeof attachmentIndex.$inferSelect
    ): Attachment => ({
      id: row.id,
      url: attachmentUrl(row.orgSlug, row.id),
      filename: row.filename,
      contentType: row.contentType,
      byteSize: row.byteSize,
      status: row.status,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt
    })

    const prepare: AttachmentsShape["prepare"] = (
      orgSlug,
      slug,
      ticketId,
      userId,
      input
    ) =>
      Effect.gen(function* () {
        const { organizationId } = yield* requireProject(orgSlug, userId, slug)

        const invalid = validateUploadRequest(input)
        if (invalid) {
          if (invalid.kind === "type") {
            return yield* new AttachmentTypeRejected({
              contentType: invalid.contentType
            })
          }
          return yield* new AttachmentTooLarge({ maxBytes: invalid.maxBytes })
        }

        const connection = yield* orgStorage.requireConnection(orgSlug)

        const id = ulid()
        const objectKey = attachmentObjectKey({
          keyPrefix: connection.keyPrefix,
          orgSlug,
          projectSlug: slug,
          ticketId,
          attachmentId: id,
          filename: input.filename
        })

        const uploadUrl = yield* s3
          .presignPut(connection, objectKey, input.contentType, 900)
          .pipe(
            Effect.catchTag("S3Unavailable", (error) =>
              Effect.fail(mapS3Unavailable(error))
            )
          )

        yield* db
          .insert(attachmentIndex)
          .values({
            id,
            organizationId,
            orgSlug,
            projectSlug: slug,
            ticketId,
            objectKey,
            filename: input.filename,
            contentType: input.contentType,
            byteSize: input.byteSize,
            status: "pending",
            uploadedBy: userId
          })
          .pipe(Effect.orDie)

        const now = yield* DateTime.now
        const expiresAt = DateTime.toDate(
          DateTime.addDuration(now, "900 seconds")
        )

        return {
          id,
          url: attachmentUrl(orgSlug, id),
          uploadUrl,
          expiresAt
        }
      })

    const commit: AttachmentsShape["commit"] = (
      orgSlug,
      slug,
      ticketId,
      userId,
      attachmentId
    ) =>
      Effect.gen(function* () {
        yield* requireProject(orgSlug, userId, slug)

        const rows = yield* db
          .select()
          .from(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.orgSlug, orgSlug),
              eq(attachmentIndex.projectSlug, slug),
              eq(attachmentIndex.ticketId, ticketId)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)

        const row = rows[0]
        if (!row) return yield* new NotFound()

        if (row.status === "live") {
          return toAttachment(row)
        }

        const connection = yield* orgStorage.requireConnection(orgSlug)

        const head = yield* s3
          .headObject(connection, row.objectKey)
          .pipe(
            Effect.catchTag("S3Unavailable", (error) =>
              Effect.fail(mapS3Unavailable(error))
            )
          )

        if (!head) {
          return yield* new AttachmentNotUploaded()
        }

        const observedContentType = head.contentType ?? row.contentType
        const invalid = validateUploadRequest({
          contentType: observedContentType,
          byteSize: head.byteSize
        })

        const sizeMismatch = head.byteSize !== row.byteSize

        if (invalid || sizeMismatch) {
          yield* s3
            .deleteObject(connection, row.objectKey)
            .pipe(
              Effect.catchTag("S3Unavailable", (error) =>
                Effect.fail(mapS3Unavailable(error))
              )
            )
          yield* db
            .delete(attachmentIndex)
            .where(eq(attachmentIndex.id, row.id))
            .pipe(Effect.orDie)

          if (invalid?.kind === "type") {
            return yield* new AttachmentTypeRejected({
              contentType: invalid.contentType
            })
          }
          return yield* new AttachmentTooLarge({
            maxBytes:
              invalid?.kind === "size" ? invalid.maxBytes : ATTACHMENT_MAX_BYTES
          })
        }

        const now = yield* DateTime.nowAsDate
        const [updated] = yield* db
          .update(attachmentIndex)
          .set({
            status: "live",
            committedAt: now,
            contentType: observedContentType,
            byteSize: head.byteSize
          })
          .where(eq(attachmentIndex.id, row.id))
          .returning()
          .pipe(Effect.orDie)

        return toAttachment(updated)
      })

    const resolveForServing: AttachmentsShape["resolveForServing"] = (
      orgSlug,
      attachmentId,
      userId
    ) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.orgSlug, orgSlug)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)

        const row = rows[0]
        if (!row || !isServableStatus(row.status)) {
          return yield* new NotFound()
        }

        yield* projects
          .requireMember(orgSlug, userId, row.projectSlug)
          .pipe(Effect.catchTag("NotFound", () => Effect.fail(new Forbidden())))

        const connection = yield* orgStorage.requireConnection(orgSlug)

        const url = yield* s3
          .presignGet(
            connection,
            row.objectKey,
            row.filename,
            isRasterImageContentType(row.contentType),
            60
          )
          .pipe(
            Effect.catchTag("S3Unavailable", (error) =>
              Effect.fail(mapS3Unavailable(error))
            )
          )

        return { url }
      })

    const reconcileTicket: AttachmentsShape["reconcileTicket"] = (
      orgSlug,
      slug,
      ticketId,
      body
    ) =>
      Effect.gen(function* () {
        const referenced = new Set(
          extractAttachmentRefs(body)
            .filter((ref) => ref.orgSlug === orgSlug)
            .map((ref) => ref.id)
        )

        const ownRows = yield* db
          .select({
            id: attachmentIndex.id,
            ticketId: attachmentIndex.ticketId,
            status: attachmentIndex.status
          })
          .from(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.orgSlug, orgSlug),
              eq(attachmentIndex.projectSlug, slug),
              eq(attachmentIndex.ticketId, ticketId)
            )
          )
          .pipe(Effect.orDie)

        const referencedRows =
          referenced.size === 0
            ? []
            : yield* db
                .select({
                  id: attachmentIndex.id,
                  ticketId: attachmentIndex.ticketId,
                  status: attachmentIndex.status
                })
                .from(attachmentIndex)
                .where(
                  and(
                    eq(attachmentIndex.orgSlug, orgSlug),
                    inArray(attachmentIndex.id, [...referenced])
                  )
                )
                .pipe(Effect.orDie)

        const plan = planReconciliation({
          ticketId,
          referenced,
          rows: [...ownRows, ...referencedRows]
        })

        const now = yield* DateTime.nowAsDate

        if (plan.toOrphan.length > 0) {
          yield* db
            .update(attachmentIndex)
            .set({ status: "orphaned", orphanedAt: now })
            .where(inArray(attachmentIndex.id, plan.toOrphan))
            .pipe(Effect.orDie)
        }

        if (plan.toRestore.length > 0) {
          yield* db
            .update(attachmentIndex)
            .set({ status: "live", orphanedAt: null })
            .where(inArray(attachmentIndex.id, plan.toRestore))
            .pipe(Effect.orDie)
        }
      }).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("attachment reconciliation failed", cause)
        )
      )

    const reapOnce: AttachmentsShape["reapOnce"] = () =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(attachmentIndex)
          .where(inArray(attachmentIndex.status, ["pending", "orphaned"]))
          .pipe(Effect.orDie)

        const now = yield* Clock.currentTimeMillis
        const ids = new Set(
          planReap({
            now,
            rows: rows.map((row) => ({
              id: row.id,
              status: row.status,
              createdAt: row.createdAt,
              orphanedAt: row.orphanedAt
            }))
          })
        )

        const candidates = rows.filter((row) => ids.has(row.id))

        const byOrg = new Map<string, Array<(typeof candidates)[number]>>()
        for (const row of candidates) {
          const existing = byOrg.get(row.orgSlug)
          if (existing) {
            existing.push(row)
          } else {
            byOrg.set(row.orgSlug, [row])
          }
        }

        let deleted = 0

        for (const [orgSlug, orgRows] of byOrg) {
          const connectionResult = yield* orgStorage
            .requireConnection(orgSlug)
            .pipe(Effect.either)

          if (connectionResult._tag === "Left") {
            yield* Effect.logError(
              "attachment reap failed to resolve org storage",
              { orgSlug, error: connectionResult.left }
            )
            continue
          }

          const connection = connectionResult.right

          for (const row of orgRows) {
            const claimed = yield* db
              .delete(attachmentIndex)
              .where(
                and(
                  eq(attachmentIndex.id, row.id),
                  eq(attachmentIndex.status, row.status)
                )
              )
              .returning({ id: attachmentIndex.id })
              .pipe(Effect.orDie)

            if (claimed.length === 0) continue

            const outcome = yield* s3
              .deleteObject(connection, row.objectKey)
              .pipe(Effect.either)

            if (outcome._tag === "Left") {
              yield* Effect.logError(
                "attachment reap left an orphaned object in the bucket",
                {
                  attachmentId: row.id,
                  objectKey: row.objectKey,
                  orgSlug,
                  error: outcome.left
                }
              )
              continue
            }

            deleted += 1
          }
        }

        return { deleted }
      }).pipe(
        Effect.catchAllCause((cause) =>
          Effect.zipRight(
            Effect.logError("attachment reap failed", cause),
            Effect.succeed({ deleted: 0 })
          )
        )
      )

    return {
      prepare,
      commit,
      resolveForServing,
      reconcileTicket,
      reapOnce
    } satisfies AttachmentsShape
  })
)
