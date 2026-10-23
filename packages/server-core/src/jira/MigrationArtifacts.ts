import type { StorageConfigMissing, StorageNotConnected } from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
export const JiraArtifactRef = Schema.Struct({
  key: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  byteSize: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  sha256: Schema.NonEmptyString
})
export type JiraArtifactRef = typeof JiraArtifactRef.Type

export type JiraArtifactCoordinates = Readonly<{
  migrationId: string
  scanRevision: number
  area: string
  kind: string
  identity: string
}>

export class JiraArtifactError extends Data.TaggedError("JiraArtifactError")<
  Readonly<{
    key: string
    reason:
      | "invalid_json"
      | "invalid_storage_key"
      | "missing"
      | "schema"
      | "sha256"
      | "size"
      | "write_intent"
  }>
> {}

export type JiraMigrationArtifactError =
  | JiraArtifactStorageError
  | StorageConfigMissing
  | StorageNotConnected
  | JiraArtifactError

export const artifactKey = (coordinates: JiraArtifactCoordinates): string =>
  `migrations/jira/${coordinates.migrationId}/scan-${coordinates.scanRevision}/${coordinates.area}/${coordinates.kind}/${coordinates.identity}.json`

export type JiraMigrationArtifactsShape = Readonly<{
  writeJson: (
    orgSlug: string,
    coordinates: JiraArtifactCoordinates,
    value: Schema.Json
  ) => Effect.Effect<JiraArtifactRef, JiraMigrationArtifactError>
  readJson: <A>(
    orgSlug: string,
    ref: JiraArtifactRef,
    decode: ReturnType<typeof Schema.decodeUnknownEffect<Schema.Decoder<A>>>
  ) => Effect.Effect<A, JiraMigrationArtifactError>
  verify: (
    orgSlug: string,
    ref: JiraArtifactRef
  ) => Effect.Effect<void, JiraMigrationArtifactError>
  listPrefix: (
    orgSlug: string,
    prefix: string
  ) => Effect.Effect<ReadonlyArray<string>, JiraMigrationArtifactError>
  deletePrefix: (
    orgSlug: string,
    prefix: string
  ) => Effect.Effect<void, JiraMigrationArtifactError>
}>

export class JiraMigrationArtifacts extends Context.Service<
  JiraMigrationArtifacts,
  JiraMigrationArtifactsShape
>()("@pp/server-core/jira/MigrationArtifacts/JiraMigrationArtifacts") {}

export type JiraArtifactStorageError = Readonly<
  Error & { _tag: "S3Unavailable"; reason: string; retryable: boolean }
>
