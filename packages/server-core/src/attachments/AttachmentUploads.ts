import type {
  Attachment,
  AttachmentNotUploaded,
  PrepareAttachmentInput,
  PrepareAttachmentResult,
  TicketId,
  Unauthorized,
  Validation,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Stream from "effect/Stream"

import type { AttachmentUploadError } from "./Attachments"

export class AttachmentUploads extends Context.Service<
  AttachmentUploads,
  {
    readonly prepare: (
      ticketId: TicketId,
      input: Omit<PrepareAttachmentInput, "byteSize">
    ) => Effect.Effect<
      PrepareAttachmentResult,
      AttachmentUploadError,
      ProjectScope
    >
    readonly receive: (
      token: string,
      contentType: string,
      body: Stream.Stream<Uint8Array, Validation>
    ) => Effect.Effect<
      Pick<Attachment, "id" | "url" | "filename" | "contentType">,
      | Forbidden
      | AttachmentUploadError
      | AttachmentNotUploaded
      | Unauthorized
      | Validation
    >
  }
>()("@pp/server-core/attachments/AttachmentUploads") {}
