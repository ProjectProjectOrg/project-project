import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentContentType,
  type Attachment,
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
  ) => Effect.Effect<
    Attachment,
    AttachmentUploadError | AttachmentNotUploaded
  >
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
  readonly reapOnce: () => Effect.Effect<{ readonly deleted: number }>
}

export class Attachments extends Context.Tag(
  "@projectproject/backend/Services/Attachments"
)<Attachments, AttachmentsShape>() {}

export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000
export const REAPER_INTERVAL_MS = 60 * 60 * 1000

export interface ReconciliationRow {
  readonly id: string
  readonly status: "pending" | "live" | "orphaned"
}

export const planReconciliation = (input: {
  readonly referenced: ReadonlySet<string>
  readonly rows: ReadonlyArray<ReconciliationRow>
}): {
  readonly toOrphan: ReadonlyArray<string>
  readonly toRestore: ReadonlyArray<string>
} => {
  const toOrphan: string[] = []
  const toRestore: string[] = []
  for (const row of input.rows) {
    if (row.status === "pending") continue
    const referenced = input.referenced.has(row.id)
    if (row.status === "live" && !referenced) toOrphan.push(row.id)
    if (row.status === "orphaned" && referenced) toRestore.push(row.id)
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
