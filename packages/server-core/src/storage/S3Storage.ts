import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export class S3Unavailable extends Data.TaggedError("S3Unavailable")<{
  readonly reason: string
  readonly retryable: boolean
}> {}

export const S3Endpoint = Schema.URLFromString.pipe(
  Schema.check(
    Schema.makeFilter(
      (url) =>
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
)

export type S3Connection = Readonly<{
  endpoint: string
  bucket: string
  region: string
  keyPrefix: string | null
  forcePathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}>

const MAX_FILENAME_LENGTH = 120

export const sanitizeFilename = (filename: string): string => {
  const collapsed = filename
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "")
  if (collapsed === "" || collapsed === ".") return "file"
  if (collapsed.length <= MAX_FILENAME_LENGTH) return collapsed
  const dot = collapsed.lastIndexOf(".")
  if (dot <= 0) return collapsed.slice(0, MAX_FILENAME_LENGTH)
  const ext = collapsed.slice(dot)
  return `${collapsed.slice(0, MAX_FILENAME_LENGTH - ext.length)}${ext}`
}

export type AttachmentKeyInput = Readonly<{
  keyPrefix: string | null
  orgSlug: string
  projectSlug: string
  ticketId: string | null
  attachmentId: string
  filename: string
}>

export const attachmentObjectKey = (input: AttachmentKeyInput): string => {
  const prefix = (input.keyPrefix ?? "").replace(/^\/+|\/+$/g, "")
  const scope = input.ticketId === null ? "images" : `tickets/${input.ticketId}`
  const tail = `orgs/${input.orgSlug}/projects/${input.projectSlug}/${scope}/${input.attachmentId}-${sanitizeFilename(input.filename)}`
  return prefix === "" ? tail : `${prefix}/${tail}`
}

export const normalizeEtag = (etag: string | undefined): string | null => {
  if (!etag) return null
  const trimmed = etag.replace(/^"|"$/g, "").toLowerCase()
  return /^[0-9a-f]{32}$/.test(trimmed) ? trimmed : null
}

export type S3ObjectHead = Readonly<{
  byteSize: number
  contentType: string | null
  contentHash: string | null
}>

export type S3StorageShape = Readonly<{
  putObject: (
    connection: S3Connection,
    key: string,
    contentType: string,
    bytes: Uint8Array
  ) => Effect.Effect<void, S3Unavailable>
  readonly getObject: (
    connection: S3Connection,
    key: string
  ) => Effect.Effect<Uint8Array | null, S3Unavailable>
  readonly listObjectKeys: (
    connection: S3Connection,
    prefix: string
  ) => Effect.Effect<ReadonlyArray<string>, S3Unavailable>
  readonly presignPut: (
    connection: S3Connection,
    key: string,
    contentType: string,
    expiresInSeconds: number
  ) => Effect.Effect<string, S3Unavailable>
  presignGet: (
    connection: S3Connection,
    key: string,
    filename: string,
    inline: boolean,
    expiresInSeconds: number
  ) => Effect.Effect<string, S3Unavailable>
  headObject: (
    connection: S3Connection,
    key: string
  ) => Effect.Effect<S3ObjectHead | null, S3Unavailable>
  deleteObject: (
    connection: S3Connection,
    key: string
  ) => Effect.Effect<void, S3Unavailable>
  checkConnection: (
    connection: S3Connection
  ) => Effect.Effect<void, S3Unavailable>
}>

export class S3Storage extends Context.Service<S3Storage, S3StorageShape>()(
  "@pp/server-core/storage/S3Storage"
) {}
