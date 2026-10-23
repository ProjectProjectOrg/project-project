// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { S3Storage, type S3Connection } from "@pp/server-core/storage/S3Storage"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Json))

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
          const json = yield* encodeJson(value).pipe(
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
      readJson: (orgSlug, ref, decode) =>
        Effect.gen(function* () {
          const bytes = yield* getVerified(orgSlug, ref)
          return yield* decodeJson(new TextDecoder().decode(bytes)).pipe(
            Effect.flatMap(decode),
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

import {
  JiraMigrationArtifacts,
  JiraArtifactError,
  artifactKey,
  type JiraArtifactRef
} from "@pp/integration-jira/MigrationArtifacts"
