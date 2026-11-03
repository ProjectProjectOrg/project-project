// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Json))

const normalizePrefix = (prefix: string | null): string =>
  (prefix ?? "").replace(/^\/+|\/+$/g, "")

const physicalKey = (
  connection: S3Storage.S3Connection,
  logicalKey: string
): string => {
  const prefix = normalizePrefix(connection.keyPrefix)
  return prefix === "" ? logicalKey : `${prefix}/${logicalKey}`
}

const logicalKey = (
  connection: S3Storage.S3Connection,
  key: string
): Effect.Effect<string, MigrationArtifacts.JiraArtifactError> => {
  const prefix = normalizePrefix(connection.keyPrefix)
  if (prefix === "") return Effect.succeed(key)
  const physicalPrefix = `${prefix}/`
  return key.startsWith(physicalPrefix)
    ? Effect.succeed(key.slice(physicalPrefix.length))
    : Effect.fail(
        new MigrationArtifacts.JiraArtifactError({
          key,
          reason: "invalid_storage_key"
        })
      )
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex")

const make = Effect.gen(function* () {
  const orgStorage = yield* OrgStorage.OrgStorage
  const s3 = yield* S3Storage.S3Storage

  const getVerified = Effect.fn("JiraMigrationArtifacts.getVerified")(
    function* (orgSlug: string, ref: MigrationArtifacts.JiraArtifactRef) {
      const connection = yield* orgStorage.requireConnection(orgSlug)
      const bytes = yield* s3.getObject(
        connection,
        physicalKey(connection, ref.key)
      )
      if (bytes === null) {
        return yield* new MigrationArtifacts.JiraArtifactError({
          key: ref.key,
          reason: "missing"
        })
      }
      if (bytes.byteLength !== ref.byteSize) {
        return yield* new MigrationArtifacts.JiraArtifactError({
          key: ref.key,
          reason: "size"
        })
      }
      if (sha256(bytes) !== ref.sha256) {
        return yield* new MigrationArtifacts.JiraArtifactError({
          key: ref.key,
          reason: "sha256"
        })
      }
      return bytes
    }
  )

  const writeJson = Effect.fn("JiraMigrationArtifacts.writeJson")(function* (
    orgSlug: string,
    coordinates: MigrationArtifacts.JiraArtifactCoordinates,
    value: Schema.Json
  ) {
    const key = MigrationArtifacts.artifactKey(coordinates)
    const json = yield* encodeJson(value).pipe(
      Effect.mapError(
        () =>
          new MigrationArtifacts.JiraArtifactError({
            key,
            reason: "invalid_json"
          })
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
  })

  const readJson = Effect.fn("JiraMigrationArtifacts.readJson")(function* <A>(
    orgSlug: string,
    ref: MigrationArtifacts.JiraArtifactRef,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
  ) {
    const bytes = yield* getVerified(orgSlug, ref)
    return yield* decodeJson(new TextDecoder().decode(bytes)).pipe(
      Effect.flatMap(decode),
      Effect.mapError(
        () =>
          new MigrationArtifacts.JiraArtifactError({
            key: ref.key,
            reason: "schema"
          })
      )
    )
  })

  const verify = Effect.fn("JiraMigrationArtifacts.verify")(function* (
    orgSlug: string,
    ref: MigrationArtifacts.JiraArtifactRef
  ) {
    yield* getVerified(orgSlug, ref)
  })

  const listPrefix = Effect.fn("JiraMigrationArtifacts.listPrefix")(function* (
    orgSlug: string,
    prefix: string
  ) {
    const connection = yield* orgStorage.requireConnection(orgSlug)
    const keys = yield* s3.listObjectKeys(
      connection,
      physicalKey(connection, prefix)
    )
    const logicalKeys = yield* Effect.forEach(keys, (key) =>
      logicalKey(connection, key)
    )
    return logicalKeys.toSorted()
  })

  const deletePrefix = Effect.fn("JiraMigrationArtifacts.deletePrefix")(
    function* (orgSlug: string, prefix: string) {
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
    }
  )

  return MigrationArtifacts.JiraMigrationArtifacts.of({
    writeJson,
    readJson,
    verify,
    listPrefix,
    deletePrefix
  })
})

export const JiraMigrationArtifactsLive = Layer.effect(
  MigrationArtifacts.JiraMigrationArtifacts,
  make
)
