import type {
  Attachment,
  AttachmentNotUploaded,
  PrepareAttachmentInput,
  PrepareAttachmentResult,
  TicketId,
  Unauthorized,
  Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Stream from "effect/Stream"

import type { AttachmentUploadError } from "./Attachments"

export interface TicketAttachmentUpload {
  readonly orgSlug: string
  readonly projectSlug: string
  readonly ticketId: TicketId
}

export class AttachmentUploads extends Context.Service<
  AttachmentUploads,
  {
    readonly prepare: (
      ticket: TicketAttachmentUpload,
      userId: string,
      input: Omit<PrepareAttachmentInput, "byteSize">
    ) => Effect.Effect<PrepareAttachmentResult, AttachmentUploadError>
    readonly receive: (
      token: string,
      contentType: string,
      body: Stream.Stream<Uint8Array, Validation>
    ) => Effect.Effect<
      Pick<Attachment, "id" | "url" | "filename" | "contentType">,
      AttachmentUploadError | AttachmentNotUploaded | Unauthorized | Validation
    >
  }
>()("@pp/server-core/attachments/AttachmentUploads") {}
