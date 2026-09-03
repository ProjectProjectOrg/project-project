import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import type * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  ATTACHMENT_MAX_BYTES,
  encodeCursor,
  isAllowedAttachmentContentType,
  type Attachment,
  type AttachmentListParams,
  type AttachmentRow,
  type AttachmentSort,
  type AttachmentSummary,
  type CursorPayload,
  type Validation,
  type AttachmentNotUploaded,
  type AttachmentTooLarge,
  type AttachmentTypeRejected,
  type Forbidden,
  type NotFound,
  type PrepareAttachmentInput,
  type PrepareAttachmentResult,
  type StorageConfigMissing,
  type StorageError,
  type StorageNotConnected
} from "@projectproject/shared"

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

export const attachmentCursorValue = (
  row: { readonly createdAt: Date; readonly byteSize: number },
  sort: AttachmentSort | undefined
): string =>
  attachmentSortPlan(sort).column === "byteSize"
    ? String(row.byteSize)
    : row.createdAt.toISOString()

export const attachmentCursorBound = (
  cursor: CursorPayload,
  sort: AttachmentSort | undefined
): number | Date | null => {
  if (attachmentSortPlan(sort).column === "byteSize") {
    const byteSize = Number(cursor.sort)
    return Number.isFinite(byteSize) ? byteSize : null
  }
  return Option.match(DateTime.make(cursor.sort), {
    onNone: () => null,
    onSome: DateTime.toDate
  })
}

export const DEFAULT_ATTACHMENT_LIMIT = 50

export interface PageableAttachmentRow {
  readonly id: string
  readonly createdAt: Date
  readonly byteSize: number
}

export const planAttachmentPage = <A extends PageableAttachmentRow>(input: {
  readonly rows: ReadonlyArray<A>
  readonly limit: number
  readonly sort: AttachmentSort | undefined
}): {
  readonly rows: ReadonlyArray<A>
  readonly nextCursor: string | null
} => {
  if (input.rows.length <= input.limit) {
    return { rows: input.rows, nextCursor: null }
  }
  const rows = input.rows.slice(0, input.limit)
  const last = rows[rows.length - 1]!
  return {
    rows,
    nextCursor: encodeCursor({
      id: last.id,
      sort: attachmentCursorValue(last, input.sort)
    })
  }
}

export const isAttachmentDeletable = (row: {
  readonly status: "pending" | "live" | "orphaned"
}): boolean => row.status === "orphaned"

export const isServableStatus = (
  status: "pending" | "live" | "orphaned"
): boolean => status === "live" || status === "orphaned"

export type AttachmentValidationError =
  | { readonly kind: "type"; readonly contentType: string }
  | { readonly kind: "size"; readonly maxBytes: number }

export const validateUploadRequest = (input: {
  readonly contentType: string
  readonly byteSize: number
}): AttachmentValidationError | null => {
  if (!isAllowedAttachmentContentType(input.contentType)) {
    return { kind: "type", contentType: input.contentType }
  }
  if (input.byteSize <= 0 || input.byteSize > ATTACHMENT_MAX_BYTES) {
    return { kind: "size", maxBytes: ATTACHMENT_MAX_BYTES }
  }
  return null
}

export type AttachmentUploadError =
  | NotFound
  | Forbidden
  | AttachmentTooLarge
  | AttachmentTypeRejected
  | StorageNotConnected
  | StorageConfigMissing
  | StorageError

export interface AttachmentsShape {
  readonly prepare: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    userId: string,
    input: PrepareAttachmentInput
  ) => Effect.Effect<PrepareAttachmentResult, AttachmentUploadError>
  readonly commit: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    userId: string,
    attachmentId: string
  ) => Effect.Effect<Attachment, AttachmentUploadError | AttachmentNotUploaded>
  readonly resolveForServing: (
    orgSlug: string,
    attachmentId: string,
    userId: string
  ) => Effect.Effect<
    { readonly url: string },
    | NotFound
    | Forbidden
    | StorageNotConnected
    | StorageConfigMissing
    | StorageError
  >
  readonly reconcileTicket: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    body: string
  ) => Effect.Effect<void>
  readonly orphanProject: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<{ readonly orphaned: number }>
  readonly listForOrg: (
    orgSlug: string,
    userId: string,
    params: AttachmentListParams
  ) => Effect.Effect<
    {
      readonly items: ReadonlyArray<AttachmentRow>
      readonly nextCursor: string | null
    },
    NotFound | Forbidden | Validation
  >
  readonly summarizeForOrg: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<AttachmentSummary, NotFound | Forbidden>
  readonly deleteForOrg: (
    orgSlug: string,
    attachmentId: string,
    userId: string
  ) => Effect.Effect<
    void,
    | NotFound
    | Forbidden
    | StorageNotConnected
    | StorageConfigMissing
    | StorageError
  >
  readonly reapOnce: () => Effect.Effect<{ readonly deleted: number }>
}

export class Attachments extends Context.Tag(
  "@projectproject/backend/Services/Attachments"
)<Attachments, AttachmentsShape>() {}

export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000
export const REAPER_INTERVAL_MS = 60 * 60 * 1000

export interface ReconciliationRow {
  readonly id: string
  readonly ticketId: string
  readonly status: "pending" | "live" | "orphaned"
}

export const planReconciliation = (input: {
  readonly ticketId: string
  readonly referenced: ReadonlySet<string>
  readonly rows: ReadonlyArray<ReconciliationRow>
}): {
  readonly toOrphan: ReadonlyArray<string>
  readonly toRestore: ReadonlyArray<string>
} => {
  const toOrphan: string[] = []
  const toRestore: string[] = []
  const seen = new Set<string>()
  for (const row of input.rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    if (input.referenced.has(row.id)) {
      if (row.status !== "live") toRestore.push(row.id)
      continue
    }
    if (row.status === "live" && row.ticketId === input.ticketId) {
      toOrphan.push(row.id)
    }
  }
  return { toOrphan, toRestore }
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
