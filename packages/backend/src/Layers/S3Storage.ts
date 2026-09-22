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
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  normalizeEtag,
  S3Endpoint,
  S3Storage,
  S3Unavailable,
  type S3Connection
} from "../Services/S3Storage"

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

const isAuthFailure = (cause: unknown) => {
  const name = (cause as { name?: string } | null)?.name ?? ""
  const status =
    (cause as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode ?? 0
  return (
    status === 401 ||
    status === 403 ||
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch" ||
    name === "AccessDenied"
  )
}

const isNotFound = (cause: unknown) => {
  const name = (cause as { name?: string } | null)?.name ?? ""
  const status =
    (cause as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode ?? 0
  return status === 404 || name === "NotFound" || name === "NoSuchKey"
}

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new S3Unavailable({
        reason: isAuthFailure(cause)
          ? "auth"
          : ((cause as { name?: string } | null)?.name ?? "unknown"),
        retryable: !isAuthFailure(cause)
      })
  })

const withClientEffect = Effect.fn("S3Storage.withClientEffect")(function* <A>(
  connection: S3Connection,
  use: (client: S3Client) => Effect.Effect<A, S3Unavailable>
) {
  yield* Schema.decodeEffect(S3Endpoint)(connection.endpoint).pipe(
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

export const S3StorageLive = Layer.succeed(
  S3Storage,
  S3Storage.of({
    putObject: (connection, key, contentType, bytes) =>
      withClient(connection, async (client) => {
        await client.send(
          new PutObjectCommand({
            Bucket: connection.bucket,
            Key: key,
            ContentType: contentType,
            Body: bytes
          })
        )
      }),
    getObject: (connection, key) =>
      withClient(connection, async (client) => {
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
      }),
    listObjectKeys: (connection, prefix) =>
      withClientEffect(connection, (client) => {
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
      }),
    presignPut: (connection, key, contentType, expiresInSeconds) =>
      withClient(connection, (client) =>
        getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: connection.bucket,
            Key: key,
            ContentType: contentType
          }),
          { expiresIn: expiresInSeconds }
        )
      ),
    presignGet: (connection, key, filename, inline, expiresInSeconds) =>
      withClient(connection, (client) =>
        getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: connection.bucket,
            Key: key,
            ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"`
          }),
          { expiresIn: expiresInSeconds }
        )
      ),
    headObject: (connection, key) =>
      withClient(connection, async (client) => {
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
      }),
    deleteObject: (connection, key) =>
      withClient(connection, async (client) => {
        await client.send(
          new DeleteObjectCommand({ Bucket: connection.bucket, Key: key })
        )
      }),
    checkConnection: (connection) =>
      withClient(connection, async (client) => {
        await client.send(new HeadBucketCommand({ Bucket: connection.bucket }))
      })
  })
)
