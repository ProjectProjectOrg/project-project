import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  attachmentIndex,
  attachmentReference,
  projectImageReference,
  projectIndex
} from "@pp/db/schema"
import {
  ATTACHMENT_MAX_BYTES,
  attachmentUrl,
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  extractAttachmentRefs,
  Forbidden,
  isAttachmentDeletable,
  isRasterImageContentType,
  NotFound,
  OrgScope,
  StorageError,
  type Attachment,
  type AttachmentRow,
  type AttachmentTicketRef,
  ProjectScope
} from "@pp/shared"
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql
} from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ulid } from "ulid"

import { Access } from "../access/Access"
import { projectInOrg } from "../projects/projectLookup"
import { OrgStorage } from "../storage/OrgStorage"
import {
  attachmentObjectKey,
  S3Storage,
  type S3Connection
} from "../storage/S3Storage"
import {
  Attachments,
  attachmentPageOffset,
  attachmentServesInline,
  attachmentSortPlan,
  DEFAULT_ATTACHMENT_LIMIT,
  isServableStatus,
  planReap,
  DEDUPE_HASH_BATCH,
  planDedupe,
  planReferences,
  summarizeAttachments,
  planStatuses,
  validateUploadRequest,
  type AttachmentsShape
} from "./Attachments"

const mapS3Unavailable = (error: { reason: string }) =>
  new StorageError({ reason: error.reason })

export const AttachmentsLive = Layer.effect(
  Attachments,
  Effect.gen(function* () {
    const db = yield* Db
    const access = yield* Access
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage

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

    const toAttachmentRow = (
      row: typeof attachmentIndex.$inferSelect,
      projectSlug: string | null,
      tickets: ReadonlyArray<AttachmentTicketRef>
    ): AttachmentRow => ({
      ...toAttachment(row),
      projectSlug,
      ticketId: row.ticketId,
      tickets
    })

    const libraryAttachmentIsVisible = () =>
      or(publishedProject(projectIndex), isNull(projectIndex.slug))!

    const prepare: AttachmentsShape["prepare"] = (ticketId, input) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId, organizationId, projectId } =
          yield* ProjectScope

        if (ticketId === null) {
          if (!isRasterImageContentType(input.contentType))
            return yield* new AttachmentTypeRejected({
              contentType: input.contentType
            })
        }

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
            projectId,
            ticketId,
            objectKey,
            filename: input.filename,
            contentType: input.contentType,
            byteSize: input.byteSize ?? 0,
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

    const commit: AttachmentsShape["commit"] = (ticketId, attachmentId) =>
      Effect.gen(function* () {
        const { orgSlug, projectId } = yield* ProjectScope

        const rows = yield* db
          .select()
          .from(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.orgSlug, orgSlug),
              eq(attachmentIndex.projectId, projectId),
              ticketId === null
                ? isNull(attachmentIndex.ticketId)
                : eq(attachmentIndex.ticketId, ticketId)
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
        const invalid =
          ticketId === null && !isRasterImageContentType(observedContentType)
            ? { kind: "type" as const, contentType: observedContentType }
            : validateUploadRequest({
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

        const twin =
          head.contentHash === null
            ? undefined
            : (yield* db
                .select({ objectKey: attachmentIndex.objectKey })
                .from(attachmentIndex)
                .where(
                  and(
                    eq(attachmentIndex.orgSlug, orgSlug),
                    eq(attachmentIndex.contentHash, head.contentHash),
                    eq(attachmentIndex.byteSize, head.byteSize),
                    inArray(attachmentIndex.status, ["live", "orphaned"])
                  )
                )
                .limit(1)
                .pipe(Effect.orDie))[0]

        const canonicalPresent =
          twin === undefined
            ? false
            : yield* s3.headObject(connection, twin.objectKey).pipe(
                Effect.map((head) => head !== null),
                Effect.orElseSucceed(() => false)
              )

        const canonicalKey = canonicalPresent
          ? (twin?.objectKey ?? row.objectKey)
          : row.objectKey

        const now = yield* DateTime.nowAsDate
        const [updated] = yield* db
          .update(attachmentIndex)
          .set({
            status: ticketId === null ? "orphaned" : "live",
            orphanedAt: ticketId === null ? now : null,
            committedAt: now,
            contentType: observedContentType,
            byteSize: head.byteSize,
            contentHash: head.contentHash,
            objectKey: canonicalKey
          })
          .where(eq(attachmentIndex.id, row.id))
          .returning()
          .pipe(Effect.orDie)

        if (canonicalKey !== row.objectKey) {
          yield* s3
            .deleteObject(connection, row.objectKey)
            .pipe(
              Effect.catch((error) =>
                Effect.logError(
                  "attachment dedupe left a duplicate object in the bucket",
                  { attachmentId: row.id, objectKey: row.objectKey, error }
                )
              )
            )
        }

        return toAttachment(updated)
      })

    const resolveForServing: AttachmentsShape["resolveForServing"] = (
      orgSlug,
      attachmentId,
      options
    ) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ row: attachmentIndex, projectSlug: projectIndex.slug })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.orgSlug, orgSlug),
              libraryAttachmentIsVisible()
            )
          )
          .limit(1)
          .pipe(Effect.orDie)

        const found = rows[0]
        const row = found?.row
        if (!row || !isServableStatus(row.status)) {
          return yield* new NotFound()
        }

        const permitted =
          found.projectSlug === null
            ? (yield* access.org(orgSlug)).permissions.can({
                storage: ["manage"]
              })
            : (yield* access.project(
                orgSlug,
                found.projectSlug
              )).permissions.can({ ticket: ["read"] })
        if (!permitted) return yield* new Forbidden()

        const connection = yield* orgStorage.requireConnection(orgSlug)

        const url = yield* s3
          .presignGet(
            connection,
            row.objectKey,
            row.filename,
            attachmentServesInline({
              contentType: row.contentType,
              download: options?.download ?? false
            }),
            60
          )
          .pipe(
            Effect.catchTag("S3Unavailable", (error) =>
              Effect.fail(mapS3Unavailable(error))
            )
          )

        return { url, contentType: row.contentType }
      })

    const deleteObjectIfUnshared = (
      connection: S3Connection,
      row: { readonly id: string; readonly objectKey: string }
    ) =>
      Effect.gen(function* () {
        const sharers = yield* db
          .select({ id: attachmentIndex.id })
          .from(attachmentIndex)
          .where(eq(attachmentIndex.objectKey, row.objectKey))
          .limit(1)
          .pipe(Effect.orDie)

        if (sharers.length > 0) return
        yield* s3.deleteObject(connection, row.objectKey)
      })

    const listForOrg: AttachmentsShape["listForOrg"] = (params) =>
      Effect.gen(function* () {
        const { organizationId } = yield* OrgScope

        const limit = params.limit ?? DEFAULT_ATTACHMENT_LIMIT
        const plan = attachmentSortPlan(params.sort)
        const column =
          plan.column === "byteSize"
            ? attachmentIndex.byteSize
            : attachmentIndex.createdAt
        const order = plan.direction === "desc" ? desc : asc

        const conditions = [eq(attachmentIndex.organizationId, organizationId)]
        if (params.status) {
          conditions.push(eq(attachmentIndex.status, params.status))
        }
        if (params.projectSlug) {
          conditions.push(eq(projectIndex.slug, params.projectSlug))
        }
        const where = and(...conditions)

        const items = yield* db
          .select({ row: attachmentIndex, projectSlug: projectIndex.slug })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(and(where, libraryAttachmentIsVisible()))
          .orderBy(order(column), order(attachmentIndex.id))
          .limit(limit)
          .offset(attachmentPageOffset(params.page, limit))
          .pipe(Effect.orDie)

        const references =
          items.length === 0
            ? []
            : yield* db
                .select({
                  attachmentId: attachmentReference.attachmentId,
                  projectSlug: projectIndex.slug,
                  ticketId: attachmentReference.ticketId
                })
                .from(attachmentReference)
                .innerJoin(
                  projectIndex,
                  eq(projectIndex.id, attachmentReference.projectId)
                )
                .where(
                  and(
                    inArray(
                      attachmentReference.attachmentId,
                      items.map((item) => item.row.id)
                    ),
                    publishedProject(projectIndex)
                  )
                )
                .pipe(Effect.orDie)

        const byAttachment = new Map<string, Array<AttachmentTicketRef>>()
        for (const reference of references) {
          const target = byAttachment.get(reference.attachmentId)
          const entry = {
            projectSlug: reference.projectSlug,
            ticketId: reference.ticketId
          }
          if (target) target.push(entry)
          else byAttachment.set(reference.attachmentId, [entry])
        }

        const counted = yield* db
          .select({ total: sql<number>`count(*)::int` })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(and(where, libraryAttachmentIsVisible()))
          .pipe(Effect.orDie)

        return {
          items: items.map((item) =>
            toAttachmentRow(
              item.row,
              item.projectSlug,
              byAttachment.get(item.row.id) ?? []
            )
          ),
          total: Number(counted[0]?.total ?? 0)
        }
      })

    const summarizeForOrg: AttachmentsShape["summarizeForOrg"] = () =>
      Effect.gen(function* () {
        const { organizationId } = yield* OrgScope

        const rows = yield* db
          .select({
            objectKey: attachmentIndex.objectKey,
            byteSize: attachmentIndex.byteSize,
            status: attachmentIndex.status
          })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(
            and(
              eq(attachmentIndex.organizationId, organizationId),
              libraryAttachmentIsVisible()
            )
          )
          .pipe(Effect.orDie)

        return summarizeAttachments({ rows })
      })

    const deleteForOrg: AttachmentsShape["deleteForOrg"] = (attachmentId) =>
      Effect.gen(function* () {
        const { organizationId, orgSlug } = yield* OrgScope

        const rows = yield* db
          .select({ attachment: attachmentIndex })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.organizationId, organizationId),
              libraryAttachmentIsVisible()
            )
          )
          .limit(1)
          .pipe(Effect.orDie)

        const row = rows[0]?.attachment
        if (!row) return yield* new NotFound()
        if (!isAttachmentDeletable(row)) return yield* new Forbidden()
        const bannerRefs = yield* db
          .select()
          .from(projectImageReference)
          .where(eq(projectImageReference.attachmentId, row.id))
          .limit(1)
          .pipe(Effect.orDie)
        if (bannerRefs.length > 0) return yield* new Forbidden()

        const connection = yield* orgStorage.requireConnection(orgSlug)

        const claimed = yield* db
          .delete(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.id, row.id),
              inArray(attachmentIndex.status, ["live", "orphaned"])
            )
          )
          .returning({ id: attachmentIndex.id })
          .pipe(Effect.orDie)

        if (claimed.length === 0) return yield* new Forbidden()

        yield* deleteObjectIfUnshared(connection, row).pipe(
          Effect.catchTag("S3Unavailable", (error) =>
            Effect.fail(mapS3Unavailable(error))
          )
        )
      })

    const reconcileTicket: AttachmentsShape["reconcileTicket"] = (
      orgSlug,
      slug,
      ticketId,
      body
    ) =>
      Effect.gen(function* () {
        const { id: projectId } = yield* projectInOrg(db, orgSlug, slug)
        const referenced = new Set(
          extractAttachmentRefs(body)
            .filter((ref) => ref.orgSlug === orgSlug)
            .map((ref) => ref.id)
        )

        const existing = yield* db
          .select({ attachmentId: attachmentReference.attachmentId })
          .from(attachmentReference)
          .where(
            and(
              eq(attachmentReference.projectId, projectId),
              eq(attachmentReference.ticketId, ticketId)
            )
          )
          .pipe(Effect.orDie)

        const known =
          referenced.size === 0
            ? []
            : yield* db
                .select({ id: attachmentIndex.id })
                .from(attachmentIndex)
                .where(
                  and(
                    eq(attachmentIndex.orgSlug, orgSlug),
                    inArray(attachmentIndex.id, [...referenced])
                  )
                )
                .pipe(Effect.orDie)

        const plan = planReferences({
          referenced: new Set(known.map((row) => row.id)),
          existing: existing.map((row) => row.attachmentId)
        })

        if (plan.toRemove.length > 0) {
          yield* db
            .delete(attachmentReference)
            .where(
              and(
                eq(attachmentReference.projectId, projectId),
                eq(attachmentReference.ticketId, ticketId),
                inArray(attachmentReference.attachmentId, plan.toRemove)
              )
            )
            .pipe(Effect.orDie)
        }

        if (plan.toAdd.length > 0) {
          yield* db
            .insert(attachmentReference)
            .values(
              plan.toAdd.map((attachmentId) => ({
                attachmentId,
                projectId,
                ticketId
              }))
            )
            .onConflictDoNothing()
            .pipe(Effect.orDie)
        }

        const touched = [...new Set([...plan.toAdd, ...plan.toRemove])]
        if (touched.length === 0) return

        const counts = yield* db
          .select({
            attachmentId: attachmentReference.attachmentId,
            references: sql<number>`count(*)::int`
          })
          .from(attachmentReference)
          .where(inArray(attachmentReference.attachmentId, touched))
          .groupBy(attachmentReference.attachmentId)
          .pipe(Effect.orDie)

        const rows = yield* db
          .select({ id: attachmentIndex.id, status: attachmentIndex.status })
          .from(attachmentIndex)
          .where(inArray(attachmentIndex.id, touched))
          .pipe(Effect.orDie)

        const statuses = planStatuses({
          rows,
          referenceCounts: new Map(
            counts.map((row) => [row.attachmentId, Number(row.references)])
          )
        })

        const now = yield* DateTime.nowAsDate

        const hasReference = sql`(exists (select 1 from ${attachmentReference} where ${attachmentReference.attachmentId} = ${attachmentIndex.id}) or exists (select 1 from ${projectImageReference} where ${projectImageReference.attachmentId} = ${attachmentIndex.id}))`

        if (statuses.toOrphan.length > 0) {
          yield* db
            .update(attachmentIndex)
            .set({ status: "orphaned", orphanedAt: now })
            .where(
              and(
                inArray(attachmentIndex.id, statuses.toOrphan),
                eq(attachmentIndex.status, "live"),
                sql`not ${hasReference}`
              )
            )
            .pipe(Effect.orDie)
        }

        if (statuses.toLive.length > 0) {
          yield* db
            .update(attachmentIndex)
            .set({ status: "live", orphanedAt: null })
            .where(
              and(
                inArray(attachmentIndex.id, statuses.toLive),
                eq(attachmentIndex.status, "orphaned"),
                hasReference
              )
            )
            .pipe(Effect.orDie)
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("attachment reconciliation failed", cause)
        )
      )

    const projectAttachmentIds = (projectId: string) =>
      Effect.gen(function* () {
        const uploaded = yield* db
          .select({ id: attachmentIndex.id })
          .from(attachmentIndex)
          .where(eq(attachmentIndex.projectId, projectId))
          .pipe(Effect.orDie)
        const referenced = yield* db
          .select({ id: attachmentReference.attachmentId })
          .from(attachmentReference)
          .where(eq(attachmentReference.projectId, projectId))
          .pipe(Effect.orDie)
        const images = yield* db
          .select({ id: projectImageReference.attachmentId })
          .from(projectImageReference)
          .where(eq(projectImageReference.projectId, projectId))
          .pipe(Effect.orDie)
        return [
          ...new Set(
            [...uploaded, ...referenced, ...images].map((row) => row.id)
          )
        ]
      })

    const orphanUnreferenced = (orgSlug: string, ids: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        if (ids.length === 0) return 0
        const now = yield* DateTime.nowAsDate
        const hasReference = sql`(exists (select 1 from ${attachmentReference} where ${attachmentReference.attachmentId} = ${attachmentIndex.id}) or exists (select 1 from ${projectImageReference} where ${projectImageReference.attachmentId} = ${attachmentIndex.id}))`
        const orphaned = yield* db
          .update(attachmentIndex)
          .set({ status: "orphaned", orphanedAt: now })
          .where(
            and(
              eq(attachmentIndex.orgSlug, orgSlug),
              eq(attachmentIndex.status, "live"),
              sql`not ${hasReference}`,
              inArray(attachmentIndex.id, [...ids])
            )
          )
          .returning({ id: attachmentIndex.id })
          .pipe(Effect.orDie)
        return orphaned.length
      })

    const orphanProject: AttachmentsShape["orphanProject"] = (
      orgSlug,
      slug,
      removal
    ) =>
      Effect.gen(function* () {
        const ids = yield* projectInOrg(db, orgSlug, slug).pipe(
          Effect.flatMap((project) => projectAttachmentIds(project.id)),
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logError("collecting project attachments failed", cause),
              []
            )
          )
        )
        yield* removal
        const orphaned = yield* orphanUnreferenced(orgSlug, ids).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logError("orphaning project attachments failed", cause),
              0
            )
          )
        )
        return { orphaned }
      })

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
            .pipe(Effect.result)

          if (connectionResult._tag === "Failure") {
            yield* Effect.logError(
              "attachment reap failed to resolve org storage",
              { orgSlug, error: connectionResult.failure }
            )
            continue
          }

          const connection = connectionResult.success

          for (const row of orgRows) {
            const claimed = yield* db
              .delete(attachmentIndex)
              .where(
                and(
                  eq(attachmentIndex.id, row.id),
                  eq(attachmentIndex.status, row.status),
                  sql`not exists (select 1 from ${projectImageReference} where ${projectImageReference.attachmentId} = ${attachmentIndex.id})`
                )
              )
              .returning({ id: attachmentIndex.id })
              .pipe(Effect.orDie)

            if (claimed.length === 0) continue

            const outcome = yield* deleteObjectIfUnshared(connection, row).pipe(
              Effect.result
            )

            if (outcome._tag === "Failure") {
              yield* Effect.logError(
                "attachment reap left an orphaned object in the bucket",
                {
                  attachmentId: row.id,
                  objectKey: row.objectKey,
                  orgSlug,
                  error: outcome.failure
                }
              )
              continue
            }

            deleted += 1
          }
        }

        return { deleted }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.andThen(
            Effect.logError("attachment reap failed", cause),
            Effect.succeed({ deleted: 0 })
          )
        )
      )

    const missingIds: AttachmentsShape["missingIds"] = (orgSlug, ids) =>
      ids.length === 0
        ? Effect.succeed([])
        : db
            .select({ id: attachmentIndex.id })
            .from(attachmentIndex)
            .where(
              and(
                eq(attachmentIndex.orgSlug, orgSlug),
                inArray(attachmentIndex.id, [...ids]),
                inArray(attachmentIndex.status, ["live", "orphaned"])
              )
            )
            .pipe(
              Effect.map((rows) => {
                const resolvable = new Set(rows.map((row) => row.id))
                return ids.filter((id) => !resolvable.has(id))
              }),
              Effect.orDie
            )

    const dedupeOnce: AttachmentsShape["dedupeOnce"] = () =>
      Effect.gen(function* () {
        const unhashed = yield* db
          .select()
          .from(attachmentIndex)
          .where(
            and(
              isNull(attachmentIndex.contentHash),
              inArray(attachmentIndex.status, ["live", "orphaned"])
            )
          )
          .limit(DEDUPE_HASH_BATCH)
          .pipe(Effect.orDie)

        let hashed = 0

        for (const row of unhashed) {
          const connection = yield* orgStorage
            .requireConnection(row.orgSlug)
            .pipe(Effect.result)
          if (connection._tag === "Failure") continue

          const head = yield* s3
            .headObject(connection.success, row.objectKey)
            .pipe(Effect.result)
          if (head._tag === "Failure" || head.success === null) continue
          if (head.success.contentHash === null) continue

          yield* db
            .update(attachmentIndex)
            .set({ contentHash: head.success.contentHash })
            .where(eq(attachmentIndex.id, row.id))
            .pipe(Effect.orDie)
          hashed += 1
        }

        const duplicated = yield* db
          .select({
            orgSlug: attachmentIndex.orgSlug,
            contentHash: attachmentIndex.contentHash,
            byteSize: attachmentIndex.byteSize
          })
          .from(attachmentIndex)
          .where(
            and(
              isNotNull(attachmentIndex.contentHash),
              inArray(attachmentIndex.status, ["live", "orphaned"])
            )
          )
          .groupBy(
            attachmentIndex.orgSlug,
            attachmentIndex.contentHash,
            attachmentIndex.byteSize
          )
          .having(sql`count(distinct ${attachmentIndex.objectKey}) > 1`)
          .pipe(Effect.orDie)

        if (duplicated.length === 0) return { hashed, deduped: 0 }

        const rows = yield* db
          .select({
            id: attachmentIndex.id,
            orgSlug: attachmentIndex.orgSlug,
            objectKey: attachmentIndex.objectKey,
            contentHash: attachmentIndex.contentHash,
            byteSize: attachmentIndex.byteSize,
            createdAt: attachmentIndex.createdAt
          })
          .from(attachmentIndex)
          .where(
            and(
              inArray(attachmentIndex.status, ["live", "orphaned"]),
              or(
                ...duplicated.map((group) =>
                  and(
                    eq(attachmentIndex.orgSlug, group.orgSlug),
                    eq(attachmentIndex.contentHash, group.contentHash!),
                    eq(attachmentIndex.byteSize, group.byteSize)
                  )
                )
              )
            )
          )
          .pipe(Effect.orDie)

        const byOrg = new Map<string, Array<(typeof rows)[number]>>()
        for (const row of rows) {
          const existing = byOrg.get(row.orgSlug)
          if (existing) existing.push(row)
          else byOrg.set(row.orgSlug, [row])
        }

        let deduped = 0

        for (const [orgSlug, orgRows] of byOrg) {
          const repoints = planDedupe({ rows: orgRows })
          if (repoints.length === 0) continue

          const connection = yield* orgStorage
            .requireConnection(orgSlug)
            .pipe(Effect.result)
          if (connection._tag === "Failure") continue

          for (const repoint of repoints) {
            yield* db
              .update(attachmentIndex)
              .set({ objectKey: repoint.toKey })
              .where(eq(attachmentIndex.id, repoint.id))
              .pipe(Effect.orDie)

            const freed = yield* deleteObjectIfUnshared(connection.success, {
              id: repoint.id,
              objectKey: repoint.fromKey
            }).pipe(Effect.result)

            if (freed._tag === "Failure") {
              yield* Effect.logError(
                "attachment dedupe left a duplicate object in the bucket",
                {
                  attachmentId: repoint.id,
                  objectKey: repoint.fromKey,
                  orgSlug,
                  error: freed.failure
                }
              )
              continue
            }
            deduped += 1
          }
        }

        return { hashed, deduped }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.andThen(
            Effect.logError("attachment dedupe failed", cause),
            Effect.succeed({ hashed: 0, deduped: 0 })
          )
        )
      )

    return {
      prepare,
      commit,
      resolveForServing,
      reconcileTicket,
      orphanProject,
      listForOrg,
      summarizeForOrg,
      deleteForOrg,
      missingIds,
      reapOnce,
      dedupeOnce
    } satisfies AttachmentsShape
  })
)
