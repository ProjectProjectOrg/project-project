import { it } from "@effect/vitest"
import { OrgScope, type OrgRole } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { describe, expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { orgScope } from "../access/testing"
import * as OrgStorage from "./OrgStorage"
import * as S3Storage from "./S3Storage"
import * as SecretCrypto from "./SecretCrypto"

describe("maskAccessKeyId", () => {
  it("keeps the last four characters", () => {
    expect(OrgStorage.maskAccessKeyId("AKIAIOSFODNN7EXAMPLE")).toBe(
      "****************MPLE"
    )
  })

  it("masks a short key entirely", () => {
    expect(OrgStorage.maskAccessKeyId("abc")).toBe("***")
  })

  it("masks an empty key to an empty string", () => {
    expect(OrgStorage.maskAccessKeyId("")).toBe("")
  })

  it("never reveals more than the last four characters", () => {
    const masked = OrgStorage.maskAccessKeyId("projectproject")
    expect(masked.endsWith("ject")).toBe(true)
    expect(masked.startsWith("*")).toBe(true)
    expect(masked).toHaveLength("projectproject".length)
  })
})

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

const storageLayer = OrgStorage.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      databaseLayer(() =>
        Effect.succeed([
          [
            row.endpoint,
            row.bucket,
            row.region,
            row.keyPrefix,
            row.forcePathStyle,
            row.accessKeyId,
            row.status,
            row.connectedAt.toISOString(),
            row.lastCheckedAt.toISOString(),
            row.lastCheckError
          ]
        ])
      ),
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die(new Error("Unexpected HTTP request")))
      ),
      Layer.mock(S3Storage.S3Storage, {}),
      Layer.mock(SecretCrypto.SecretCrypto, {})
    )
  )
)

const as = (role: OrgRole) => Effect.provideService(OrgScope, orgScope(role))

describe("OrgStorage", () => {
  it.effect("shows the connection details to people who manage storage", () =>
    Effect.gen(function* () {
      const storage = yield* OrgStorage.OrgStorage
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
        const storage = yield* OrgStorage.OrgStorage
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

  it.effect("traces getStatus under its own span", () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return Effect.gen(function* () {
      const storage = yield* OrgStorage.OrgStorage
      yield* storage.getStatus().pipe(as("admin"))
    }).pipe(
      Effect.withTracer(tracer),
      Effect.provide(storageLayer),
      Effect.map(() =>
        expect(
          spans
            .filter((span) => Option.isNone(span.parent))
            .map((span) => span.name)
        ).toEqual(["OrgStorage.getStatus"])
      )
    )
  })

  it.effect("traces disconnect with getStatus beneath it", () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return Effect.gen(function* () {
      const storage = yield* OrgStorage.OrgStorage
      yield* storage.disconnect().pipe(as("admin"))
    }).pipe(
      Effect.withTracer(tracer),
      Effect.provide(storageLayer),
      Effect.map(() => {
        const disconnect = spans.find(
          (span) => span.name === "OrgStorage.disconnect"
        )
        expect(disconnect?.parent).toEqual(Option.none())
        expect(
          spans
            .filter((span) => span.name === "OrgStorage.getStatus")
            .map((span) => Option.map(span.parent, (parent) => parent.spanId))
        ).toEqual([Option.some(disconnect?.spanId)])
      })
    )
  })
})
