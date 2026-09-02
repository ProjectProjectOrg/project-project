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
}

export class Attachments extends Context.Tag(
  "@projectproject/backend/Services/Attachments"
)<Attachments, AttachmentsShape>() {}
