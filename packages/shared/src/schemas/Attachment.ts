import * as Schema from "effect/Schema"

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

export const RASTER_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif"
] as const

export const ATTACHMENT_CONTENT_TYPES = [
  ...RASTER_IMAGE_CONTENT_TYPES,
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-tar"
] as const

export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number]

const normalizeContentType = (value: string) =>
  value.split(";")[0]!.trim().toLowerCase()

export const isAllowedAttachmentContentType = (value: string): boolean =>
  (ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(value)
  )

export const isRasterImageContentType = (value: string): boolean =>
  (RASTER_IMAGE_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(value)
  )

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const AttachmentId = Schema.String.pipe(
  Schema.pattern(ULID_PATTERN),
  Schema.brand("AttachmentId")
)
export type AttachmentId = typeof AttachmentId.Type

export const AttachmentStatus = Schema.Literal("pending", "live", "orphaned")
export type AttachmentStatus = typeof AttachmentStatus.Type

export const Attachment = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  filename: Schema.String,
  contentType: Schema.String,
  byteSize: Schema.Number,
  status: AttachmentStatus,
  uploadedBy: Schema.String,
  createdAt: Schema.Date
})
export type Attachment = typeof Attachment.Type

export const PrepareAttachmentInput = Schema.Struct({
  filename: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  contentType: Schema.String.pipe(Schema.minLength(1)),
  byteSize: Schema.Number.pipe(Schema.int())
})
export type PrepareAttachmentInput = typeof PrepareAttachmentInput.Type

export const PrepareAttachmentResult = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  uploadUrl: Schema.String,
  expiresAt: Schema.Date
})
export type PrepareAttachmentResult = typeof PrepareAttachmentResult.Type

export const OrgStorageStatus = Schema.Struct({
  status: Schema.Literal("not_connected", "active", "broken"),
  endpoint: Schema.NullOr(Schema.String),
  bucket: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  keyPrefix: Schema.NullOr(Schema.String),
  accessKeyIdMasked: Schema.NullOr(Schema.String),
  forcePathStyle: Schema.Boolean,
  connectedAt: Schema.NullOr(Schema.Date),
  lastCheckedAt: Schema.NullOr(Schema.Date),
  lastCheckError: Schema.NullOr(Schema.String)
})
export type OrgStorageStatus = typeof OrgStorageStatus.Type

export const ConnectStorageInput = Schema.Struct({
  endpoint: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  bucket: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  region: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  accessKeyId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  secretAccessKey: Schema.String.pipe(Schema.minLength(1)),
  keyPrefix: Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
  forcePathStyle: Schema.Boolean
})
export type ConnectStorageInput = typeof ConnectStorageInput.Type
