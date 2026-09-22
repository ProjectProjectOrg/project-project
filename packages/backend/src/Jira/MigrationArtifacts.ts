import { createHash } from "node:crypto"
import type {
  StorageConfigMissing,
  StorageNotConnected
} from "@projectproject/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { OrgStorage } from "../Services/OrgStorage"
import {
  S3Storage,
  type S3Connection,
  type S3Unavailable
} from "../Services/S3Storage"

export const JiraArtifactRef = Schema.Struct({
  key: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  byteSize: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  sha256: Schema.NonEmptyString
})
export type JiraArtifactRef = typeof JiraArtifactRef.Type

export interface JiraArtifactCoordinates {
  readonly migrationId: string
  readonly scanRevision: number
  readonly area: string
  readonly kind: string
  readonly identity: string
}

export class JiraArtifactError extends Data.TaggedError("JiraArtifactError")<{
  readonly key: string
  readonly reason:
    | "invalid_json"
    | "invalid_storage_key"
    | "missing"
    | "schema"
    | "sha256"
    | "size"
}> {}

export type JiraMigrationArtifactError =
  | S3Unavailable
  | StorageConfigMissing
  | StorageNotConnected
  | JiraArtifactError

export const artifactKey = (coordinates: JiraArtifactCoordinates): string =>
  `migrations/jira/${coordinates.migrationId}/scan-${coordinates.scanRevision}/${coordinates.area}/${coordinates.kind}/${coordinates.identity}.json`

export interface JiraMigrationArtifactsShape {
  readonly writeJson: (
    orgSlug: string,
    coordinates: JiraArtifactCoordinates,
    value: unknown
  ) => Effect.Effect<JiraArtifactRef, JiraMigrationArtifactError>
  readonly readJson: <A>(
    orgSlug: string,
    ref: JiraArtifactRef,
    schema: Schema.Decoder<A>
  ) => Effect.Effect<A, JiraMigrationArtifactError>
  readonly verify: (
    orgSlug: string,
    ref: JiraArtifactRef
  ) => Effect.Effect<void, JiraMigrationArtifactError>
  readonly listPrefix: (
    orgSlug: string,
    prefix: string
  ) => Effect.Effect<ReadonlyArray<string>, JiraMigrationArtifactError>
  readonly deletePrefix: (
    orgSlug: string,
    prefix: string
  ) => Effect.Effect<void, JiraMigrationArtifactError>
}

export class JiraMigrationArtifacts extends Context.Service<
  JiraMigrationArtifacts,
  JiraMigrationArtifactsShape
>()("@projectproject/backend/Jira/MigrationArtifacts/JiraMigrationArtifacts") {}

const normalizePrefix = (prefix: string | null): string =>
  (prefix ?? "").replace(/^\/+|\/+$/g, "")

const physicalKey = (connection: S3Connection, logicalKey: string): string => {
  const prefix = normalizePrefix(connection.keyPrefix)
  return prefix === "" ? logicalKey : `${prefix}/${logicalKey}`
}

const logicalKey = (
  connection: S3Connection,
  key: string
): Effect.Effect<string, JiraArtifactError> => {
  const prefix = normalizePrefix(connection.keyPrefix)
  if (prefix === "") return Effect.succeed(key)
  const physicalPrefix = `${prefix}/`
  return key.startsWith(physicalPrefix)
    ? Effect.succeed(key.slice(physicalPrefix.length))
    : Effect.fail(new JiraArtifactError({ key, reason: "invalid_storage_key" }))
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex")

export const JiraMigrationArtifactsLive = Layer.effect(
  JiraMigrationArtifacts,
  Effect.gen(function* () {
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage

    const getVerified = Effect.fn("JiraMigrationArtifacts.getVerified")(
      function* (orgSlug: string, ref: JiraArtifactRef) {
        const connection = yield* orgStorage.requireConnection(orgSlug)
        const bytes = yield* s3.getObject(
          connection,
          physicalKey(connection, ref.key)
        )
        if (bytes === null) {
          return yield* new JiraArtifactError({
            key: ref.key,
            reason: "missing"
          })
        }
        if (bytes.byteLength !== ref.byteSize) {
          return yield* new JiraArtifactError({ key: ref.key, reason: "size" })
        }
        if (sha256(bytes) !== ref.sha256) {
          return yield* new JiraArtifactError({
            key: ref.key,
            reason: "sha256"
          })
        }
        return bytes
      }
    )

    return JiraMigrationArtifacts.of({
      writeJson: (orgSlug, coordinates, value) =>
        Effect.gen(function* () {
          const key = artifactKey(coordinates)
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown)
          )(value).pipe(
            Effect.mapError(
              () => new JiraArtifactError({ key, reason: "invalid_json" })
            )
          )
          const bytes = new TextEncoder().encode(json)
          const connection = yield* orgStorage.requireConnection(orgSlug)
          yield* s3.putObject(
            connection,
            physicalKey(connection, key),
            "application/json",
            bytes
          )
          return {
            key,
            contentType: "application/json",
            byteSize: bytes.byteLength,
            sha256: sha256(bytes)
          }
        }),
      readJson: (orgSlug, ref, schema) =>
        Effect.gen(function* () {
          const bytes = yield* getVerified(orgSlug, ref)
          return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(
            new TextDecoder().decode(bytes)
          ).pipe(
            Effect.mapError(
              () => new JiraArtifactError({ key: ref.key, reason: "schema" })
            )
          )
        }),
      verify: (orgSlug, ref) => getVerified(orgSlug, ref).pipe(Effect.asVoid),
      listPrefix: (orgSlug, prefix) =>
        Effect.gen(function* () {
          const connection = yield* orgStorage.requireConnection(orgSlug)
          const keys = yield* s3.listObjectKeys(
            connection,
            physicalKey(connection, prefix)
          )
          return yield* Effect.forEach(keys, (key) =>
            logicalKey(connection, key)
          )
        }).pipe(Effect.map((keys) => keys.toSorted())),
      deletePrefix: (orgSlug, prefix) =>
        Effect.gen(function* () {
          const connection = yield* orgStorage.requireConnection(orgSlug)
          const keys = yield* s3.listObjectKeys(
            connection,
            physicalKey(connection, prefix)
          )
          yield* Effect.forEach(
            keys,
            (key) =>
              logicalKey(connection, key).pipe(
                Effect.flatMap(() => s3.deleteObject(connection, key))
              ),
            { concurrency: 8, discard: true }
          )
        })
    })
  })
)
