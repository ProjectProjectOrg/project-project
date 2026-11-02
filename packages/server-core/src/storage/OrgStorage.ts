import { Db } from "@pp/db"
import {
  organization,
  organizationIntegration,
  organizationS3Integration
} from "@pp/db/schema"
import {
  type ConnectStorageInput,
  OrgScope,
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  type OrgStorageStatus
} from "@pp/shared"
import { and, eq, inArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import { ulid } from "ulid"

import * as S3Storage from "./S3Storage"
import * as SecretCrypto from "./SecretCrypto"

export const maskAccessKeyId = (value: string): string => {
  if (value.length <= 4) return "*".repeat(value.length)
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`
}

export type OrgStorageConnectError =
  | StorageAuthInvalid
  | StorageConfigMissing
  | StorageError

export class OrgStorage extends Context.Service<
  OrgStorage,
  Readonly<{
    getStatus: () => Effect.Effect<OrgStorageStatus, never, OrgScope>
    connect: (
      input: ConnectStorageInput
    ) => Effect.Effect<OrgStorageStatus, OrgStorageConnectError, OrgScope>
    disconnect: () => Effect.Effect<OrgStorageStatus, never, OrgScope>
    requireConnection: (
      orgSlug: string
    ) => Effect.Effect<
      S3Storage.S3Connection,
      StorageNotConnected | StorageConfigMissing
    >
  }>
>()("@pp/server-core/storage/OrgStorage") {}

const decodeS3Endpoint = Schema.decodeEffect(S3Storage.S3Endpoint)

const notConnectedStatus: OrgStorageStatus = {
  status: "not_connected",
  endpoint: null,
  bucket: null,
  region: null,
  keyPrefix: null,
  accessKeyIdMasked: null,
  forcePathStyle: true,
  connectedAt: null,
  lastCheckedAt: null,
  lastCheckError: null
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const httpClient = yield* HttpClient.HttpClient
  const s3 = yield* S3Storage.S3Storage
  const secrets = yield* SecretCrypto.SecretCrypto

  const activeOrBrokenS3Row = (organizationId: string) =>
    db
      .select({
        endpoint: organizationS3Integration.endpoint,
        bucket: organizationS3Integration.bucket,
        region: organizationS3Integration.region,
        keyPrefix: organizationS3Integration.keyPrefix,
        forcePathStyle: organizationS3Integration.forcePathStyle,
        accessKeyId: organizationS3Integration.accessKeyId,
        status: organizationIntegration.status,
        connectedAt: organizationIntegration.connectedAt,
        lastCheckedAt: organizationIntegration.lastCheckedAt,
        lastCheckError: organizationIntegration.lastCheckError
      })
      .from(organizationIntegration)
      .leftJoin(
        organizationS3Integration,
        eq(
          organizationS3Integration.organizationIntegrationId,
          organizationIntegration.id
        )
      )
      .where(
        and(
          eq(organizationIntegration.organizationId, organizationId),
          eq(organizationIntegration.provider, "s3"),
          inArray(organizationIntegration.status, ["active", "broken"])
        )
      )
      .limit(1)
      .pipe(
        Effect.orDie,
        Effect.map((rows) => rows[0] ?? null)
      )

  const getStatus = Effect.fn("OrgStorage.getStatus")(
    function* (): Effect.fn.Return<OrgStorageStatus, never, OrgScope> {
      const scope = yield* OrgScope
      const row = yield* activeOrBrokenS3Row(scope.organizationId)
      if (!row) return notConnectedStatus
      const status = row.status === "active" ? "active" : "broken"
      if (!scope.permissions.can({ storage: ["manage"] })) {
        return {
          ...notConnectedStatus,
          status,
          connectedAt: row.connectedAt,
          lastCheckedAt: row.lastCheckedAt
        }
      }
      return {
        status,
        endpoint: row.endpoint,
        bucket: row.bucket,
        region: row.region,
        keyPrefix: row.keyPrefix,
        accessKeyIdMasked:
          row.accessKeyId == null ? null : maskAccessKeyId(row.accessKeyId),
        forcePathStyle: row.forcePathStyle ?? true,
        connectedAt: row.connectedAt,
        lastCheckedAt: row.lastCheckedAt,
        lastCheckError: row.lastCheckError
      }
    }
  )

  const connectionCheckKey = (keyPrefix: string | null) => {
    const prefix = (keyPrefix ?? "").replace(/^\/+|\/+$/g, "")
    const tail = `.projectproject-connection-check/${ulid()}`
    return prefix === "" ? tail : `${prefix}/${tail}`
  }

  const mapS3Unavailable = (error: { reason: string }) =>
    error.reason === "auth"
      ? new StorageAuthInvalid()
      : new StorageError({ reason: error.reason })

  const roundTripCheck = (connection: S3Storage.S3Connection) =>
    Effect.gen(function* () {
      yield* s3.checkConnection(connection)
      const key = connectionCheckKey(connection.keyPrefix)
      const uploadUrl = yield* s3.presignPut(connection, key, "text/plain", 60)
      const uploadResponse = yield* HttpClientRequest.put(uploadUrl).pipe(
        HttpClientRequest.bodyText(
          "projectproject-connection-check",
          "text/plain"
        ),
        httpClient.execute,
        Effect.mapError(
          () => new StorageError({ reason: "connection_check_upload_failed" })
        )
      )
      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        const status = uploadResponse.status
        return yield* status === 401 || status === 403
          ? new StorageAuthInvalid()
          : new StorageError({
              reason: `connection_check_upload_status_${status}`
            })
      }
      const head = yield* s3.headObject(connection, key)
      yield* s3.deleteObject(connection, key)
      if (!head) {
        return yield* new StorageError({
          reason: "connection_check_missing_object"
        })
      }
    }).pipe(
      Effect.catchTag("S3Unavailable", (error) =>
        Effect.fail(mapS3Unavailable(error))
      )
    )

  const connect = Effect.fn("OrgStorage.connect")(function* (
    input: ConnectStorageInput
  ) {
    const org = yield* OrgScope

    const connection: S3Storage.S3Connection = {
      endpoint: input.endpoint,
      bucket: input.bucket,
      region: input.region,
      keyPrefix: input.keyPrefix,
      forcePathStyle: input.forcePathStyle,
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    }

    yield* roundTripCheck(connection)

    const sealed = yield* secrets
      .seal(input.secretAccessKey)
      .pipe(
        Effect.catchTag("SecretCryptoUnavailable", () =>
          Effect.fail(new StorageConfigMissing())
        )
      )

    const now = yield* DateTime.nowAsDate

    yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* db
            .update(organizationIntegration)
            .set({
              status: "disconnected",
              disconnectedAt: now,
              updatedAt: now
            })
            .where(
              and(
                eq(organizationIntegration.organizationId, org.organizationId),
                eq(organizationIntegration.provider, "s3"),
                inArray(organizationIntegration.status, ["active", "broken"])
              )
            )
            .pipe(Effect.orDie)

          const [created] = yield* db
            .insert(organizationIntegration)
            .values({
              organizationId: org.organizationId,
              provider: "s3",
              status: "active",
              config: {},
              lastCheckedAt: now,
              lastCheckStatus: "ok"
            })
            .returning()
            .pipe(Effect.orDie)

          yield* db
            .insert(organizationS3Integration)
            .values({
              organizationIntegrationId: created.id,
              endpoint: input.endpoint,
              bucket: input.bucket,
              region: input.region,
              keyPrefix: input.keyPrefix,
              forcePathStyle: input.forcePathStyle,
              accessKeyId: input.accessKeyId,
              encryptedSecretKey: sealed.ciphertext,
              secretKeyNonce: sealed.nonce,
              secretKeyTag: sealed.tag
            })
            .pipe(Effect.orDie)
        })
      )
      .pipe(Effect.catchTag("SqlError", Effect.die))

    return yield* getStatus()
  })

  const disconnect = Effect.fn("OrgStorage.disconnect")(function* () {
    const org = yield* OrgScope
    const now = yield* DateTime.nowAsDate
    yield* db
      .update(organizationIntegration)
      .set({
        status: "disconnected",
        disconnectedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(organizationIntegration.organizationId, org.organizationId),
          eq(organizationIntegration.provider, "s3"),
          inArray(organizationIntegration.status, ["active", "broken"])
        )
      )
      .pipe(Effect.orDie)
    return yield* getStatus()
  })

  const requireConnection = Effect.fn("OrgStorage.requireConnection")(
    function* (orgSlug: string) {
      const rows = yield* db
        .select({
          endpoint: organizationS3Integration.endpoint,
          bucket: organizationS3Integration.bucket,
          region: organizationS3Integration.region,
          keyPrefix: organizationS3Integration.keyPrefix,
          forcePathStyle: organizationS3Integration.forcePathStyle,
          accessKeyId: organizationS3Integration.accessKeyId,
          encryptedSecretKey: organizationS3Integration.encryptedSecretKey,
          secretKeyNonce: organizationS3Integration.secretKeyNonce,
          secretKeyTag: organizationS3Integration.secretKeyTag
        })
        .from(organization)
        .innerJoin(
          organizationIntegration,
          eq(organizationIntegration.organizationId, organization.id)
        )
        .innerJoin(
          organizationS3Integration,
          eq(
            organizationS3Integration.organizationIntegrationId,
            organizationIntegration.id
          )
        )
        .where(
          and(
            eq(organization.slug, orgSlug),
            eq(organizationIntegration.provider, "s3"),
            eq(organizationIntegration.status, "active")
          )
        )
        .limit(1)
        .pipe(Effect.orDie)

      const row = rows[0]
      if (!row) return yield* new StorageNotConnected()

      yield* decodeS3Endpoint(row.endpoint).pipe(
        Effect.mapError(() => new StorageConfigMissing())
      )

      const secretAccessKey = yield* secrets
        .open({
          ciphertext: row.encryptedSecretKey,
          nonce: row.secretKeyNonce,
          tag: row.secretKeyTag
        })
        .pipe(
          Effect.catchTag("SecretCryptoUnavailable", () =>
            Effect.fail(new StorageConfigMissing())
          )
        )

      return {
        endpoint: row.endpoint,
        bucket: row.bucket,
        region: row.region,
        keyPrefix: row.keyPrefix,
        forcePathStyle: row.forcePathStyle,
        accessKeyId: row.accessKeyId,
        secretAccessKey
      } satisfies S3Storage.S3Connection
    }
  )

  return OrgStorage.of({
    getStatus,
    connect,
    disconnect,
    requireConnection
  })
})

export const layer = Layer.effect(OrgStorage, make).pipe(
  Layer.provide(FetchHttpClient.layer)
)
