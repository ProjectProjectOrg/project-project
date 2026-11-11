import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  attachmentIndex,
  attachmentReference,
  projectImageReference,
  projectIndex
} from "@pp/db/schema"
import {
  ATTACHMENT_PAGE_SIZE,
  attachmentMaxBytes,
  isAllowedAttachmentContentType,
  isRasterImageContentType,
  isVideoContentType,
  type Attachment,
  type AttachmentListParams,
  type AttachmentListPage,
  type AttachmentSort,
  type AttachmentSummary,
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  type CurrentUser,
  NotFound,
  OrgScope,
  type PrepareAttachmentInput,
  type PrepareAttachmentResult,
  type StorageConfigMissing,
  StorageError,
  type StorageNotConnected,
  ProjectScope,
  Forbidden,
  attachmentUrl,
  extractAttachmentRefs,
  isAttachmentDeletable,
  type AttachmentRow,
  type AttachmentTicketRef
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
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import { ulid } from "ulid"

import * as Access from "../access/Access"
import { projectInOrg } from "../projects/projectLookup"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"

export const PENDING_TTL_MS = 60 * 60 * 1000

export const DEFAULT_ATTACHMENT_SORT: AttachmentSort = "created_desc"

export interface AttachmentSortPlan {
  readonly column: "createdAt" | "byteSize"
  readonly direction: "asc" | "desc"
}

export const attachmentSortPlan = (
  sort: AttachmentSort | undefined
): AttachmentSortPlan => {
  switch (sort ?? DEFAULT_ATTACHMENT_SORT) {
    case "created_asc":
      return { column: "createdAt", direction: "asc" }
    case "size_desc":
      return { column: "byteSize", direction: "desc" }
    case "size_asc":
      return { column: "byteSize", direction: "asc" }
    default:
      return { column: "createdAt", direction: "desc" }
  }
}

export const attachmentServesInline = (input: {
  readonly contentType: string
  readonly download: boolean
}): boolean => !input.download && isRasterImageContentType(input.contentType)

export const attachmentOpensInline = (input: {
  readonly contentType: string
  readonly download: boolean
}): boolean =>
  attachmentServesInline(input) ||
  (!input.download && isVideoContentType(input.contentType))

const PROXIED_URL_SECONDS = 60
const STREAMED_URL_SECONDS = 6 * 60 * 60

export const attachmentSignedUrlSeconds = (contentType: string): number =>
  isVideoContentType(contentType) ? STREAMED_URL_SECONDS : PROXIED_URL_SECONDS

export const deriveAttachmentEtag = (
  upstreamEtag: string | null,
  servedRung: number | null
): string | null => {
  if (upstreamEtag === null) return null
  if (servedRung === null) return upstreamEtag
  const trimmed = upstreamEtag.endsWith('"')
    ? upstreamEtag.slice(0, -1)
    : upstreamEtag
  return `${trimmed}-w${servedRung}"`
}

export const DEFAULT_ATTACHMENT_LIMIT = ATTACHMENT_PAGE_SIZE

export const attachmentPageOffset = (
  page: number | undefined,
  limit: number
): number => Math.max(0, ((page ?? 1) - 1) * limit)

export interface DedupeRow {
  readonly id: string
  readonly objectKey: string
  readonly contentHash: string | null
  readonly byteSize: number
  readonly createdAt: Date
}

export interface DedupeRepoint {
  readonly id: string
  readonly fromKey: string
  readonly toKey: string
}

export const planDedupe = (input: {
  readonly rows: ReadonlyArray<DedupeRow>
}): ReadonlyArray<DedupeRepoint> => {
  const groups = new Map<string, Array<DedupeRow>>()
  for (const row of input.rows) {
    if (row.contentHash === null) continue
    const key = `${row.contentHash}:${row.byteSize}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const repoints: Array<DedupeRepoint> = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort((left, right) => {
      const byDate = left.createdAt.getTime() - right.createdAt.getTime()
      return byDate === 0 ? left.id.localeCompare(right.id) : byDate
    })
    const canonical = ordered[0]
    for (const row of ordered.slice(1)) {
      if (row.objectKey === canonical.objectKey) continue
      repoints.push({
        id: row.id,
        fromKey: row.objectKey,
        toKey: canonical.objectKey
      })
    }
  }
  return repoints
}

const STATUS_ORDER = ["live", "orphaned", "pending"] as const

export const summarizeAttachments = (input: {
  readonly rows: ReadonlyArray<{
    readonly objectKey: string
    readonly byteSize: number
    readonly status: "pending" | "live" | "orphaned"
  }>
}): AttachmentSummary => {
  const counts = new Map<string, { count: number; bytes: number }>()
  const charged = new Set<string>()

  const ordered = [...input.rows].sort(
    (left, right) =>
      STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status)
  )

  for (const row of ordered) {
    const entry = counts.get(row.status) ?? { count: 0, bytes: 0 }
    entry.count += 1
    if (!charged.has(row.objectKey)) {
      charged.add(row.objectKey)
      entry.bytes += row.byteSize
    }
    counts.set(row.status, entry)
  }

  const byStatus = STATUS_ORDER.filter((status) => counts.has(status)).map(
    (status) => ({ status, ...counts.get(status)! })
  )

  const stored = byStatus.filter((row) => row.status !== "pending")

  return {
    byStatus,
    count: stored.reduce((total, row) => total + row.count, 0),
    bytes: stored.reduce((total, row) => total + row.bytes, 0)
  }
}

export const isServableStatus = (
  status: "pending" | "live" | "orphaned"
): boolean => status === "live" || status === "orphaned"

export type AttachmentValidationError =
  | { readonly kind: "type"; readonly contentType: string }
  | { readonly kind: "size"; readonly maxBytes: number }

export const validateUploadRequest = (input: {
  readonly contentType: string
  readonly byteSize?: number
}): AttachmentValidationError | null => {
  if (!isAllowedAttachmentContentType(input.contentType)) {
    return { kind: "type", contentType: input.contentType }
  }
  const maxBytes = attachmentMaxBytes(input.contentType)
  if (
    input.byteSize !== undefined &&
    (input.byteSize <= 0 || input.byteSize > maxBytes)
  ) {
    return { kind: "size", maxBytes }
  }
  return null
}

export type AttachmentUploadError =
  | NotFound
  | AttachmentTooLarge
  | AttachmentTypeRejected
  | StorageNotConnected
  | StorageConfigMissing
  | StorageError

export class Attachments extends Context.Service<
  Attachments,
  Readonly<{
    prepare: (
      ticketId: string | null,
      input: Omit<PrepareAttachmentInput, "byteSize"> & {
        readonly byteSize?: number
      }
    ) => Effect.Effect<
      PrepareAttachmentResult,
      AttachmentUploadError,
      ProjectScope
    >
    commit: (
      ticketId: string | null,
      attachmentId: string
    ) => Effect.Effect<
      Attachment,
      AttachmentUploadError | AttachmentNotUploaded,
      ProjectScope
    >
    storeBytes: (
      ticketId: string,
      file: Readonly<{
        filename: string
        contentType: string
        bytes: Uint8Array
      }>
    ) => Effect.Effect<
      Attachment,
      AttachmentUploadError | AttachmentNotUploaded,
      ProjectScope
    >
    resolveForServing: (
      orgSlug: string,
      attachmentId: string,
      options?: { readonly download?: boolean }
    ) => Effect.Effect<
      { readonly url: string; readonly contentType: string },
      | Forbidden
      | NotFound
      | StorageNotConnected
      | StorageConfigMissing
      | StorageError,
      CurrentUser
    >
    reconcileTicket: (
      orgSlug: string,
      slug: string,
      ticketId: string,
      body: string
    ) => Effect.Effect<void>
    orphanProject: <E, R>(
      orgSlug: string,
      slug: string,
      removal: Effect.Effect<void, E, R>
    ) => Effect.Effect<{ readonly orphaned: number }, E, R>
    listForOrg: (
      params: AttachmentListParams
    ) => Effect.Effect<AttachmentListPage, never, OrgScope>
    summarizeForOrg: () => Effect.Effect<AttachmentSummary, never, OrgScope>
    deleteForOrg: (
      attachmentId: string
    ) => Effect.Effect<
      void,
      | Forbidden
      | NotFound
      | StorageNotConnected
      | StorageConfigMissing
      | StorageError,
      OrgScope
    >
    missingIds: (
      orgSlug: string,
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<string>>
    reapOnce: () => Effect.Effect<{ readonly deleted: number }>
    dedupeOnce: () => Effect.Effect<{
      readonly hashed: number
      readonly deduped: number
    }>
  }>
>()("@pp/server-core/attachments/Attachments") {}

export const DEDUPE_HASH_BATCH = 200

export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000
export const REAPER_INTERVAL_MS = 60 * 60 * 1000

export const planReferences = (input: {
  readonly referenced: ReadonlySet<string>
  readonly existing: ReadonlyArray<string>
}): {
  readonly toAdd: ReadonlyArray<string>
  readonly toRemove: ReadonlyArray<string>
} => {
  const existing = new Set(input.existing)
  return {
    toAdd: [...input.referenced].filter((id) => !existing.has(id)),
    toRemove: [...existing].filter((id) => !input.referenced.has(id))
  }
}

export const planStatuses = (input: {
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly status: "pending" | "live" | "orphaned"
  }>
  readonly referenceCounts: ReadonlyMap<string, number>
}): {
  readonly toLive: ReadonlyArray<string>
  readonly toOrphan: ReadonlyArray<string>
} => {
  const toLive: Array<string> = []
  const toOrphan: Array<string> = []
  for (const row of input.rows) {
    const count = input.referenceCounts.get(row.id) ?? 0
    if (count > 0) {
      if (row.status === "orphaned") toLive.push(row.id)
    } else if (row.status === "live") {
      toOrphan.push(row.id)
    }
  }
  return { toLive, toOrphan }
}

export interface ReapRow {
  readonly id: string
  readonly status: "pending" | "live" | "orphaned"
  readonly createdAt: Date
  readonly orphanedAt: Date | null
}

export const planReap = (input: {
  readonly now: number
  readonly rows: ReadonlyArray<ReapRow>
}): ReadonlyArray<string> =>
  input.rows
    .filter((row) => {
      if (row.status === "pending") {
        return input.now - row.createdAt.getTime() > PENDING_TTL_MS
      }
      if (row.status === "orphaned") {
        if (row.orphanedAt === null) return false
        return input.now - row.orphanedAt.getTime() > ORPHAN_GRACE_MS
      }
      return false
    })
    .map((row) => row.id)

const mapS3Unavailable = (error: { reason: string }) =>
  new StorageError({ reason: error.reason })

const make = Effect.gen(function* () {
  const db = yield* Db
  const access = yield* Access.Access
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage

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

  const prepare = Effect.fn("Attachments.prepare")(function* (
    ticketId: string | null,
    input: Omit<PrepareAttachmentInput, "byteSize"> & {
      readonly byteSize?: number
    }
  ) {
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
    const objectKey = S3Storage.attachmentObjectKey({
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
    const expiresAt = DateTime.toDate(DateTime.addDuration(now, "900 seconds"))

    return {
      id,
      url: attachmentUrl(orgSlug, id),
      uploadUrl,
      expiresAt
    }
  })

  const commit = Effect.fn("Attachments.commit")(function* (
    ticketId: string | null,
    attachmentId: string
  ) {
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
          invalid?.kind === "size"
            ? invalid.maxBytes
            : attachmentMaxBytes(observedContentType)
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

  const storeBytes = Effect.fn("Attachments.storeBytes")(function* (
    ticketId: string,
    file: Readonly<{ filename: string; contentType: string; bytes: Uint8Array }>
  ) {
    const prepared = yield* prepare(ticketId, {
      filename: file.filename,
      contentType: file.contentType,
      byteSize: file.bytes.byteLength
    })
    const [row] = yield* db
      .select({ objectKey: attachmentIndex.objectKey })
      .from(attachmentIndex)
      .where(eq(attachmentIndex.id, prepared.id))
      .limit(1)
      .pipe(Effect.orDie)
    if (!row) return yield* new NotFound()
    const { orgSlug } = yield* ProjectScope
    const connection = yield* orgStorage.requireConnection(orgSlug)
    yield* s3
      .putObject(connection, row.objectKey, file.contentType, file.bytes)
      .pipe(
        Effect.catchTag("S3Unavailable", (error) =>
          Effect.fail(mapS3Unavailable(error))
        )
      )
    return yield* commit(ticketId, prepared.id)
  })

  const resolveForServing = Effect.fn("Attachments.resolveForServing")(
    function* (
      orgSlug: string,
      attachmentId: string,
      options?: { readonly download?: boolean }
    ) {
      const rows = yield* db
        .select({ row: attachmentIndex, projectSlug: projectIndex.slug })
        .from(attachmentIndex)
        .leftJoin(projectIndex, eq(projectIndex.id, attachmentIndex.projectId))
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
          : (yield* access.project(orgSlug, found.projectSlug)).permissions.can(
              { ticket: ["read"] }
            )
      if (!permitted) return yield* new Forbidden()

      const connection = yield* orgStorage.requireConnection(orgSlug)

      const url = yield* s3
        .presignGet(
          connection,
          row.objectKey,
          row.filename,
          attachmentOpensInline({
            contentType: row.contentType,
            download: options?.download ?? false
          }),
          attachmentSignedUrlSeconds(row.contentType)
        )
        .pipe(
          Effect.catchTag("S3Unavailable", (error) =>
            Effect.fail(mapS3Unavailable(error))
          )
        )

      return { url, contentType: row.contentType }
    }
  )

  const deleteObjectIfUnshared = (
    connection: S3Storage.S3Connection,
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

  const listForOrg = Effect.fn("Attachments.listForOrg")(function* (
    params: AttachmentListParams
  ) {
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

    const pageOf = Effect.gen(function* () {
      const items = yield* db
        .select({ row: attachmentIndex, projectSlug: projectIndex.slug })
        .from(attachmentIndex)
        .leftJoin(projectIndex, eq(projectIndex.id, attachmentIndex.projectId))
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
      return { items, references }
    })

    const [{ items, references }, counted] = yield* Effect.all(
      [
        pageOf,
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(attachmentIndex)
          .leftJoin(
            projectIndex,
            eq(projectIndex.id, attachmentIndex.projectId)
          )
          .where(and(where, libraryAttachmentIsVisible()))
          .pipe(Effect.orDie)
      ],
      { concurrency: 2 }
    )

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

    return {
      items: items.map((item) =>
        toAttachmentRow(
          item.row,
          item.projectSlug,
          byAttachment.get(item.row.id) ?? []
        )
      ),
      total: counted[0]?.total ?? 0
    }
  })

  const summarizeForOrg = Effect.fn("Attachments.summarizeForOrg")(
    function* () {
      const { organizationId } = yield* OrgScope

      const rows = yield* db
        .select({
          objectKey: attachmentIndex.objectKey,
          byteSize: attachmentIndex.byteSize,
          status: attachmentIndex.status
        })
        .from(attachmentIndex)
        .leftJoin(projectIndex, eq(projectIndex.id, attachmentIndex.projectId))
        .where(
          and(
            eq(attachmentIndex.organizationId, organizationId),
            libraryAttachmentIsVisible()
          )
        )
        .pipe(Effect.orDie)

      return summarizeAttachments({ rows })
    }
  )

  const deleteForOrg = Effect.fn("Attachments.deleteForOrg")(function* (
    attachmentId: string
  ) {
    const { organizationId, orgSlug } = yield* OrgScope

    const rows = yield* db
      .select({ attachment: attachmentIndex })
      .from(attachmentIndex)
      .leftJoin(projectIndex, eq(projectIndex.id, attachmentIndex.projectId))
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

  const reconcileTicket = Effect.fn("Attachments.reconcileTicket")(function* (
    orgSlug: string,
    slug: string,
    ticketId: string,
    body: string
  ) {
    return yield* Effect.gen(function* () {
      const referenced = new Set(
        extractAttachmentRefs(body)
          .filter((ref) => ref.orgSlug === orgSlug)
          .map((ref) => ref.id)
      )

      const [{ projectId, existing }, known] = yield* Effect.all(
        [
          Effect.gen(function* () {
            const { id: projectId } = yield* projectInOrg(db, orgSlug, slug)
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
            return { projectId, existing }
          }),
          referenced.size === 0
            ? Effect.succeed([])
            : db
                .select({ id: attachmentIndex.id })
                .from(attachmentIndex)
                .where(
                  and(
                    eq(attachmentIndex.orgSlug, orgSlug),
                    inArray(attachmentIndex.id, [...referenced])
                  )
                )
                .pipe(Effect.orDie)
        ],
        { concurrency: 2 }
      )

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

      const [counts, rows] = yield* Effect.all(
        [
          db
            .select({
              attachmentId: attachmentReference.attachmentId,
              references: sql<number>`count(*)::int`
            })
            .from(attachmentReference)
            .where(inArray(attachmentReference.attachmentId, touched))
            .groupBy(attachmentReference.attachmentId)
            .pipe(Effect.orDie),
          db
            .select({
              id: attachmentIndex.id,
              status: attachmentIndex.status
            })
            .from(attachmentIndex)
            .where(inArray(attachmentIndex.id, touched))
            .pipe(Effect.orDie)
        ],
        { concurrency: 2 }
      )

      const statuses = planStatuses({
        rows,
        referenceCounts: new Map(
          counts.map((row) => [row.attachmentId, row.references])
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
  })

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
        ...new Set([...uploaded, ...referenced, ...images].map((row) => row.id))
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

  const orphanProject = Effect.fn("Attachments.orphanProject")(function* <E, R>(
    orgSlug: string,
    slug: string,
    removal: Effect.Effect<void, E, R>
  ) {
    const ids = yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const ids = yield* projectInOrg(db, orgSlug, slug).pipe(
            Effect.tap((project) =>
              db
                .select({ id: projectIndex.id })
                .from(projectIndex)
                .where(eq(projectIndex.id, project.id))
                .for("update")
                .pipe(Effect.orDie)
            ),
            Effect.flatMap((project) => projectAttachmentIds(project.id)),
            Effect.catchTag("NotFound", () => Effect.succeed([]))
          )
          yield* removal
          return ids
        })
      )
      .pipe(Effect.catchTag("SqlError", Effect.die))
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

  const reapOnce = Effect.fn("Attachments.reapOnce")(function* () {
    return yield* Effect.gen(function* () {
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

        if (Result.isFailure(connectionResult)) {
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

          if (Result.isFailure(outcome)) {
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
  })

  const missingIds = Effect.fn("Attachments.missingIds")(function* (
    orgSlug: string,
    ids: ReadonlyArray<string>
  ) {
    return yield* ids.length === 0
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
  })

  const dedupeOnce = Effect.fn("Attachments.dedupeOnce")(function* () {
    return yield* Effect.gen(function* () {
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
        if (Result.isFailure(connection)) continue

        const head = yield* s3
          .headObject(connection.success, row.objectKey)
          .pipe(Effect.result)
        if (Result.isFailure(head) || head.success === null) continue
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
        if (Result.isFailure(connection)) continue

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

          if (Result.isFailure(freed)) {
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
  })

  return Attachments.of({
    prepare,
    commit,
    storeBytes,
    resolveForServing,
    reconcileTicket,
    orphanProject,
    listForOrg,
    summarizeForOrg,
    deleteForOrg,
    missingIds,
    reapOnce,
    dedupeOnce
  })
})

export const layer = Layer.effect(Attachments, make)
