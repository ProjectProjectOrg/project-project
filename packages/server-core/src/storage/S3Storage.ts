import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

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

export class S3Storage extends Context.Service<
  S3Storage,
  Readonly<{
    putObject: (
      connection: S3Connection,
      key: string,
      contentType: string,
      bytes: Uint8Array
    ) => Effect.Effect<void, S3Unavailable>
    getObject: (
      connection: S3Connection,
      key: string
    ) => Effect.Effect<Uint8Array | null, S3Unavailable>
    listObjectKeys: (
      connection: S3Connection,
      prefix: string
    ) => Effect.Effect<ReadonlyArray<string>, S3Unavailable>
    presignPut: (
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
>()("@pp/server-core/storage/S3Storage") {}

const decodeS3Endpoint = Schema.decodeEffect(S3Endpoint)

const clientFor = (connection: S3Connection) =>
  new S3Client({
    region: connection.region,
    endpoint: connection.endpoint,
    forcePathStyle: connection.forcePathStyle,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey
    }
  })

const S3Failure = Schema.Struct({
  name: Schema.optional(Schema.String).pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.none()))
  ),
  $metadata: Schema.optional(
    Schema.Struct({
      httpStatusCode: Schema.optional(Schema.Finite)
    })
  ).pipe(Schema.catchDecoding(() => Effect.succeed(Option.none())))
})

const decodeS3Failure = Schema.decodeUnknownOption(S3Failure)

const isAuthFailure = (failure: typeof S3Failure.Type) => {
  const { name, $metadata } = failure
  const status = $metadata?.httpStatusCode
  return (
    status === 401 ||
    status === 403 ||
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch" ||
    name === "AccessDenied"
  )
}

const isNotFound = (cause: unknown) =>
  Option.exists(
    decodeS3Failure(cause),
    ({ name, $metadata }) =>
      $metadata?.httpStatusCode === 404 ||
      name === "NotFound" ||
      name === "NoSuchKey"
  )

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => {
      const failure: typeof S3Failure.Type = Option.getOrElse(
        decodeS3Failure(cause),
        () => ({})
      )
      const authFailure = isAuthFailure(failure)
      return new S3Unavailable({
        reason: authFailure ? "auth" : (failure.name ?? "unknown"),
        retryable: !authFailure
      })
    }
  })

const withClientEffect = Effect.fn("S3Storage.withClientEffect")(function* <A>(
  connection: S3Connection,
  use: (client: S3Client) => Effect.Effect<A, S3Unavailable>
) {
  yield* decodeS3Endpoint(connection.endpoint).pipe(
    Effect.mapError(
      () =>
        new S3Unavailable({
          reason:
            "Storage endpoint must use HTTPS, or HTTP on localhost for local development.",
          retryable: false
        })
    )
  )
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => clientFor(connection)),
    use,
    (client) => Effect.sync(() => client.destroy())
  )
})

const withClient = Effect.fn("S3Storage.withClient")(function* <A>(
  connection: S3Connection,
  use: (client: S3Client) => Promise<A>
) {
  return yield* withClientEffect(connection, (client) =>
    attempt(() => use(client))
  )
})

const putObject = Effect.fn("S3Storage.putObject")(function* (
  connection: S3Connection,
  key: string,
  contentType: string,
  bytes: Uint8Array
) {
  return yield* withClient(connection, async (client) => {
    await client.send(
      new PutObjectCommand({
        Bucket: connection.bucket,
        Key: key,
        ContentType: contentType,
        Body: bytes
      })
    )
  })
})

const getObject = Effect.fn("S3Storage.getObject")(function* (
  connection: S3Connection,
  key: string
) {
  return yield* withClient(connection, async (client) => {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: connection.bucket, Key: key })
      )
      const body = response.Body
      if (!body) return null
      return new Uint8Array(await body.transformToByteArray())
    } catch (cause) {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "name" in cause &&
        (cause.name === "NoSuchKey" || cause.name === "NotFound")
      ) {
        return null
      }
      throw cause
    }
  })
})

const listObjectKeys = Effect.fn("S3Storage.listObjectKeys")(function* (
  connection: S3Connection,
  prefix: string
) {
  return yield* withClientEffect(connection, (client) => {
    const seen = new Set<string>()
    return Stream.paginate<string | undefined, string, S3Unavailable>(
      undefined,
      (continuationToken) =>
        attempt(() =>
          client.send(
            new ListObjectsV2Command({
              Bucket: connection.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken
            })
          )
        ).pipe(
          Effect.flatMap((page) => {
            const keys = (page.Contents ?? []).flatMap(({ Key }) =>
              Key === undefined ? [] : [Key]
            )
            const next = page.NextContinuationToken
            if (!page.IsTruncated && next !== undefined) {
              return Effect.fail(
                new S3Unavailable({
                  reason: "unexpected_continuation_token",
                  retryable: false
                })
              )
            }
            if (page.IsTruncated && (next === undefined || next === "")) {
              return Effect.fail(
                new S3Unavailable({
                  reason: "missing_continuation_token",
                  retryable: false
                })
              )
            }
            if (
              next !== undefined &&
              (next === continuationToken || seen.has(next))
            ) {
              return Effect.fail(
                new S3Unavailable({
                  reason: "repeated_continuation_token",
                  retryable: false
                })
              )
            }
            if (continuationToken !== undefined) seen.add(continuationToken)
            return Effect.succeed([
              keys,
              next === undefined ? Option.none() : Option.some(next)
            ] as const)
          })
        )
    ).pipe(Stream.runCollect)
  })
})

const presignPut = Effect.fn("S3Storage.presignPut")(function* (
  connection: S3Connection,
  key: string,
  contentType: string,
  expiresInSeconds: number
) {
  return yield* withClient(connection, (client) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: connection.bucket,
        Key: key,
        ContentType: contentType
      }),
      { expiresIn: expiresInSeconds }
    )
  )
})

const presignGet = Effect.fn("S3Storage.presignGet")(function* (
  connection: S3Connection,
  key: string,
  filename: string,
  inline: boolean,
  expiresInSeconds: number
) {
  return yield* withClient(connection, (client) =>
    getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: connection.bucket,
        Key: key,
        ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"`
      }),
      { expiresIn: expiresInSeconds }
    )
  )
})

const headObject = Effect.fn("S3Storage.headObject")(function* (
  connection: S3Connection,
  key: string
) {
  return yield* withClient(connection, async (client) => {
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: connection.bucket, Key: key })
      )
      return {
        byteSize: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
        contentHash: normalizeEtag(head.ETag)
      }
    } catch (cause) {
      if (isNotFound(cause)) return null
      throw cause
    }
  })
})

const deleteObject = Effect.fn("S3Storage.deleteObject")(function* (
  connection: S3Connection,
  key: string
) {
  return yield* withClient(connection, async (client) => {
    await client.send(
      new DeleteObjectCommand({ Bucket: connection.bucket, Key: key })
    )
  })
})

const checkConnection = Effect.fn("S3Storage.checkConnection")(function* (
  connection: S3Connection
) {
  return yield* withClient(connection, async (client) => {
    await client.send(new HeadBucketCommand({ Bucket: connection.bucket }))
  })
})

export const layer = Layer.succeed(
  S3Storage,
  S3Storage.of({
    putObject,
    getObject,
    listObjectKeys,
    presignPut,
    presignGet,
    headObject,
    deleteObject,
    checkConnection
  })
)
