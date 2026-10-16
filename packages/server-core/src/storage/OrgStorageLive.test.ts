import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import { OrgScope, type OrgRole } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { describe, expect } from "vitest"

import { orgScope } from "../access/testing"
import { OrgStorage } from "./OrgStorage"
import { OrgStorageLive } from "./OrgStorageLive"
import { S3Storage } from "./S3Storage"
import { SecretCrypto } from "./SecretCrypto"

const checkedAt = DateTime.toDate(DateTime.makeUnsafe("2026-09-24T10:00:00Z"))

const row = {
  endpoint: "https://storage.example.test",
  bucket: "private-bucket",
  region: "auto",
  keyPrefix: "private-prefix",
  forcePathStyle: true,
  accessKeyId: "AKIA00001234",
  status: "active",
  connectedAt: checkedAt,
  lastCheckedAt: checkedAt,
  lastCheckError: "private upstream details"
}

const storageLayer = OrgStorageLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(Db, {
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: () => ({ limit: () => Effect.succeed([row]) })
            })
          })
        })
      } as never),
      Layer.succeed(SqlClient.SqlClient, {} as never),
      Layer.succeed(HttpClient.HttpClient, {} as never),
      Layer.mock(S3Storage, {}),
      Layer.mock(SecretCrypto, {})
    )
  )
)

const as = (role: OrgRole) => Effect.provideService(OrgScope, orgScope(role))

describe("OrgStorage", () => {
  it.effect("shows the connection details to people who manage storage", () =>
    Effect.gen(function* () {
      const storage = yield* OrgStorage
      const status = yield* storage.getStatus().pipe(as("admin"))
      expect(status).toMatchObject({
        status: "active",
        bucket: "private-bucket",
        accessKeyIdMasked: "********1234",
        lastCheckError: "private upstream details"
      })
    }).pipe(Effect.provide(storageLayer))
  )

  it.effect(
    "tells everyone else only whether storage works, without its configuration",
    () =>
      Effect.gen(function* () {
        const storage = yield* OrgStorage
        for (const role of ["member", "guest"] as const) {
          expect(yield* storage.getStatus().pipe(as(role))).toStrictEqual({
            status: "active",
            endpoint: null,
            bucket: null,
            region: null,
            keyPrefix: null,
            accessKeyIdMasked: null,
            forcePathStyle: true,
            connectedAt: checkedAt,
            lastCheckedAt: checkedAt,
            lastCheckError: null
          })
        }
      }).pipe(Effect.provide(storageLayer))
  )
})
