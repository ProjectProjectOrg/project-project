import * as Effect from "effect/Effect"
import { Multipart } from "effect/http"
import { HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

const SingleLine = (max: number) =>
  Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(max),
    Schema.isPattern(/^[^\r\n]+$/u)
  )

export const FEEDBACK_MAX_ATTACHMENTS = 5
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const FeedbackKind = Schema.Literals(["bug", "feature"])
export type FeedbackKind = typeof FeedbackKind.Type

export const FeedbackTitle = SingleLine(200)
export const FeedbackDescription = Schema.String.check(
  Schema.isMaxLength(20_000)
)

export const FeedbackAttachmentFile = Schema.Struct({
  filename: SingleLine(255),
  contentType: SingleLine(255),
  byteSize: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: FEEDBACK_ATTACHMENT_MAX_BYTES })
  )
})
export type FeedbackAttachmentFile = typeof FeedbackAttachmentFile.Type

export const FeedbackAttachment = Schema.Struct({
  id: Schema.String,
  ...FeedbackAttachmentFile.fields
})
export type FeedbackAttachment = typeof FeedbackAttachment.Type

export const SubmitFeedbackInput = Schema.Struct({
  kind: FeedbackKind,
  title: FeedbackTitle,
  description: FeedbackDescription,
  route: SingleLine(2000),
  attachmentIds: Schema.Array(Schema.String).check(
    Schema.isMaxLength(FEEDBACK_MAX_ATTACHMENTS)
  )
})
export type SubmitFeedbackInput = typeof SubmitFeedbackInput.Type

export const FeedbackStatus = Schema.Struct({
  enabled: Schema.Boolean,
  attachments: Schema.Boolean
})
export type FeedbackStatus = typeof FeedbackStatus.Type

export const FeedbackReport = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  kind: FeedbackKind,
  title: FeedbackTitle,
  description: FeedbackDescription,
  reporter: Schema.Struct({
    name: SingleLine(200),
    email: SingleLine(320)
  }),
  instance: Schema.Struct({
    url: SingleLine(2000),
    version: Schema.NullOr(SingleLine(100))
  }),
  context: Schema.Struct({
    route: SingleLine(2000),
    userAgent: Schema.NullOr(SingleLine(1000))
  }),
  attachments: Schema.Array(FeedbackAttachmentFile).check(
    Schema.isMaxLength(FEEDBACK_MAX_ATTACHMENTS)
  ),
  submittedAt: Schema.DateFromString
})
export type FeedbackReport = typeof FeedbackReport.Type

export const FeedbackUploadPayload = Schema.Struct({
  file: Multipart.SingleFileSchema
}).pipe(
  HttpApiSchema.asMultipart({
    maxParts: 1,
    maxFileSize: FEEDBACK_ATTACHMENT_MAX_BYTES
  })
)

export const FeedbackIntakePayload = Schema.Struct({
  report: Schema.fromJsonString(FeedbackReport),
  files: Multipart.FilesSchema.check(
    Schema.isMaxLength(FEEDBACK_MAX_ATTACHMENTS)
  ).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed([])))
}).pipe(
  HttpApiSchema.asMultipart({
    maxParts: FEEDBACK_MAX_ATTACHMENTS + 1,
    maxFieldSize: 64 * 1024,
    maxFileSize: FEEDBACK_ATTACHMENT_MAX_BYTES,
    maxTotalSize:
      FEEDBACK_MAX_ATTACHMENTS * FEEDBACK_ATTACHMENT_MAX_BYTES + 64 * 1024
  })
)
