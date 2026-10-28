import { Db } from "@pp/db"
import { feedbackAttachment, organization } from "@pp/db/schema"
import {
  AttachmentTooLarge,
  AttachmentTypeRejected,
  attachmentUploadContentType,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  type FeedbackAttachment,
  type FeedbackAttachmentFile,
  isAllowedAttachmentContentType,
  OrgScope,
  StorageError,
  Validation
} from "@pp/shared"
import { and, eq, inArray, isNull, lt } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import type { Multipart } from "effect/http"
import * as Layer from "effect/Layer"

import { OrgStorage } from "../storage/OrgStorage"
import { S3Storage, sanitizeFilename } from "../storage/S3Storage"
import { singleLineFilename } from "./feedbackTicket"

const UNCLAIMED_TTL = "1 day"

export type FeedbackAttachmentBytes = FeedbackAttachmentFile &
  Readonly<{ bytes: Uint8Array }>

const toStorageError = (error: { reason: string }) =>
  new StorageError({ reason: error.reason })

const objectKey = (
  keyPrefix: string | null,
  orgSlug: string,
  id: string,
  filename: string
) => {
  const tail = `orgs/${orgSlug}/feedback/${id}-${sanitizeFilename(filename)}`
  return keyPrefix ? `${keyPrefix}/${tail}` : tail
}

const makeFeedbackAttachments = Effect.gen(function* () {
  const db = yield* Db
  const orgStorage = yield* OrgStorage
  const s3 = yield* S3Storage
  const fs = yield* FileSystem.FileSystem
  const crypto = yield* Crypto.Crypto

  const available = (orgSlug: string) =>
    orgStorage.requireConnection(orgSlug).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false))
    )

  const upload = Effect.fn("FeedbackAttachments.upload")(function* (
    file: Multipart.PersistedFile
  ) {
    const { organizationId, orgSlug, userId } = yield* OrgScope
    const contentType = attachmentUploadContentType(file.name, file.contentType)
    if (!isAllowedAttachmentContentType(contentType)) {
      return yield* new AttachmentTypeRejected({ contentType })
    }
    const bytes = yield* fs.readFile(file.path).pipe(Effect.orDie)
    if (bytes.byteLength === 0) {
      return yield* new Validation({ reason: "empty_attachment" })
    }
    if (bytes.byteLength > FEEDBACK_ATTACHMENT_MAX_BYTES) {
      return yield* new AttachmentTooLarge({
        maxBytes: FEEDBACK_ATTACHMENT_MAX_BYTES
      })
    }
    const connection = yield* orgStorage.requireConnection(orgSlug)
    const id = yield* crypto.randomUUIDv7().pipe(Effect.orDie)
    const filename = singleLineFilename(file.name)
    const key = objectKey(connection.keyPrefix, orgSlug, id, filename)
    yield* s3
      .putObject(connection, key, contentType, bytes)
      .pipe(Effect.mapError(toStorageError))
    yield* db
      .insert(feedbackAttachment)
      .values({
        id,
        organizationId,
        userId,
        objectKey: key,
        filename,
        contentType,
        byteSize: bytes.byteLength
      })
      .pipe(Effect.orDie)
    return {
      id,
      filename,
      contentType,
      byteSize: bytes.byteLength
    } satisfies FeedbackAttachment
  })

  const claimable = Effect.fn("FeedbackAttachments.claimable")(function* (
    ids: ReadonlyArray<string>
  ) {
    if (ids.length === 0) return []
    if (new Set(ids).size !== ids.length) {
      return yield* new Validation({ reason: "duplicate_attachment" })
    }
    const { organizationId, userId } = yield* OrgScope
    const rows = yield* db
      .select()
      .from(feedbackAttachment)
      .where(
        and(
          inArray(feedbackAttachment.id, [...ids]),
          eq(feedbackAttachment.organizationId, organizationId),
          eq(feedbackAttachment.userId, userId),
          isNull(feedbackAttachment.outboxId)
        )
      )
      .pipe(Effect.orDie)
    if (rows.length !== ids.length) {
      return yield* new Validation({ reason: "unknown_attachment" })
    }
    return rows
  })

  const claim = Effect.fn("FeedbackAttachments.claim")(function* (
    ids: ReadonlyArray<string>,
    outboxId: string
  ) {
    if (ids.length === 0) return
    const claimed = yield* db
      .update(feedbackAttachment)
      .set({ outboxId })
      .where(
        and(
          inArray(feedbackAttachment.id, [...ids]),
          isNull(feedbackAttachment.outboxId)
        )
      )
      .returning({ id: feedbackAttachment.id })
      .pipe(Effect.orDie)
    if (claimed.length !== ids.length) {
      return yield* new Validation({ reason: "attachment_already_sent" })
    }
  })

  const rowsFor = (outboxId: string) =>
    db
      .select({
        id: feedbackAttachment.id,
        objectKey: feedbackAttachment.objectKey,
        filename: feedbackAttachment.filename,
        contentType: feedbackAttachment.contentType,
        byteSize: feedbackAttachment.byteSize,
        orgSlug: organization.slug
      })
      .from(feedbackAttachment)
      .innerJoin(
        organization,
        eq(organization.id, feedbackAttachment.organizationId)
      )
      .where(eq(feedbackAttachment.outboxId, outboxId))
      .pipe(Effect.orDie)

  const load = Effect.fn("FeedbackAttachments.load")(function* (
    outboxId: string
  ) {
    const rows = yield* rowsFor(outboxId)
    const loaded = yield* Effect.forEach(rows, (row) =>
      orgStorage.requireConnection(row.orgSlug).pipe(
        Effect.flatMap((connection) => s3.getObject(connection, row.objectKey)),
        Effect.catchTags({
          StorageNotConnected: () => Effect.succeed(null),
          StorageConfigMissing: () => Effect.succeed(null)
        }),
        Effect.map((bytes) =>
          bytes === null
            ? []
            : [
                {
                  filename: row.filename,
                  contentType: row.contentType,
                  byteSize: row.byteSize,
                  bytes
                } satisfies FeedbackAttachmentBytes
              ]
        )
      )
    )
    return loaded.flat()
  })

  const remove = (
    rows: ReadonlyArray<
      Readonly<{ id: string; objectKey: string; orgSlug: string }>
    >
  ) =>
    Effect.forEach(
      rows,
      (row) =>
        orgStorage.requireConnection(row.orgSlug).pipe(
          Effect.flatMap((connection) =>
            s3.deleteObject(connection, row.objectKey)
          ),
          Effect.catch((error) =>
            Effect.logWarning("feedback attachment object not deleted", {
              attachmentId: row.id,
              objectKey: row.objectKey,
              error
            })
          ),
          Effect.andThen(
            db
              .delete(feedbackAttachment)
              .where(eq(feedbackAttachment.id, row.id))
              .pipe(Effect.orDie)
          )
        ),
      { discard: true }
    )

  const release = (outboxId: string) =>
    rowsFor(outboxId).pipe(Effect.flatMap(remove))

  const reapUnclaimed = Effect.gen(function* () {
    const cutoff = DateTime.toDate(
      DateTime.subtractDuration(yield* DateTime.now, UNCLAIMED_TTL)
    )
    const rows = yield* db
      .select({
        id: feedbackAttachment.id,
        objectKey: feedbackAttachment.objectKey,
        orgSlug: organization.slug
      })
      .from(feedbackAttachment)
      .innerJoin(
        organization,
        eq(organization.id, feedbackAttachment.organizationId)
      )
      .where(
        and(
          isNull(feedbackAttachment.outboxId),
          lt(feedbackAttachment.createdAt, cutoff)
        )
      )
      .limit(100)
      .pipe(Effect.orDie)
    yield* remove(rows)
  })

  return { available, upload, claimable, claim, load, release, reapUnclaimed }
})

export class FeedbackAttachments extends Context.Service<
  FeedbackAttachments,
  Effect.Success<typeof makeFeedbackAttachments>
>()("@pp/server-core/feedback/FeedbackAttachments") {
  static readonly layer = Layer.effect(
    FeedbackAttachments,
    makeFeedbackAttachments
  )
}
