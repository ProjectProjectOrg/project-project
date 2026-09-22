import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vite-plus/test"
import { OrgStorage } from "../Services/OrgStorage"
import {
  S3Storage,
  type S3Connection,
  type S3StorageShape
} from "../Services/S3Storage"
import {
  artifactKey,
  JiraMigrationArtifacts,
  JiraMigrationArtifactsLive
} from "./MigrationArtifacts"

const connection: S3Connection = {
  endpoint: "https://storage.example.test",
  bucket: "artifacts",
  region: "auto",
  keyPrefix: "/tenant-a/",
  forcePathStyle: true,
  accessKeyId: "key",
  secretAccessKey: "secret"
}

const coordinates = {
  migrationId: "m1",
  scanRevision: 3,
  area: "raw",
  kind: "issues",
  identity: "page-0004-abc123"
} as const

const makeLayer = () => {
  const objects = new Map<string, Uint8Array>()
  const deleted: Array<string> = []
  const storage: S3StorageShape = {
    putObject: (_connection, key, _contentType, bytes) =>
      Effect.sync(() => {
        objects.set(key, bytes)
      }),
    getObject: (_connection, key) =>
      Effect.sync(() => objects.get(key) ?? null),
    listObjectKeys: (_connection, prefix) =>
      Effect.sync(() =>
        [...objects.keys()].filter((key) => key.startsWith(prefix))
      ),
    presignPut: () => Effect.die("unused"),
    presignGet: () => Effect.die("unused"),
    headObject: () => Effect.die("unused"),
    deleteObject: (_connection, key) =>
      Effect.sync(() => {
        deleted.push(key)
        objects.delete(key)
      }),
    checkConnection: () => Effect.die("unused")
  }
  const layer = JiraMigrationArtifactsLive.pipe(
    Layer.provide(Layer.succeed(S3Storage, S3Storage.of(storage))),
    Layer.provide(
      Layer.succeed(
        OrgStorage,
        OrgStorage.of({
          getStatus: () => Effect.die("unused"),
          connect: () => Effect.die("unused"),
          disconnect: () => Effect.die("unused"),
          requireConnection: () => Effect.succeed(connection)
        })
      )
    )
  )
  return { deleted, layer, objects }
}

describe("artifactKey", () => {
  it("maps logical coordinates to one deterministic JSON key", () => {
    expect(artifactKey(coordinates)).toBe(
      "migrations/jira/m1/scan-3/raw/issues/page-0004-abc123.json"
    )
    expect(artifactKey(coordinates)).toBe(artifactKey({ ...coordinates }))
  })
})

describe("JiraMigrationArtifacts", () => {
  it.effect(
    "overwrites a logical artifact and checksums its exact bytes",
    () => {
      const { layer, objects } = makeLayer()
      return Effect.gen(function* () {
        const artifacts = yield* JiraMigrationArtifacts
        const first = yield* artifacts.writeJson("acme", coordinates, {
          body: "first"
        })
        const second = yield* artifacts.writeJson("acme", coordinates, {
          body: "second"
        })

        expect(first.key).toBe(second.key)
        expect(first.sha256).not.toBe(second.sha256)
        expect(objects.size).toBe(1)
        expect([...objects.keys()]).toEqual([
          "tenant-a/migrations/jira/m1/scan-3/raw/issues/page-0004-abc123.json"
        ])
      }).pipe(Effect.provide(layer))
    }
  )

  it.effect("keeps sensitive JSON out of workflow-facing references", () => {
    const { layer } = makeLayer()
    return Effect.gen(function* () {
      const artifacts = yield* JiraMigrationArtifacts
      const ref = yield* artifacts.writeJson("acme", coordinates, {
        body: "SENSITIVE-MARKER"
      })
      const activityResult = { manifest: ref, issueCount: 1, warnings: [] }
      const encodedActivityResult = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Unknown)
      )(activityResult)

      expect(ref).toEqual({
        key: artifactKey(coordinates),
        contentType: "application/json",
        byteSize: 27,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
      expect(encodedActivityResult).not.toContain("SENSITIVE-MARKER")
    }).pipe(Effect.provide(layer))
  })

  it.effect("verifies size and checksum before decoding JSON", () => {
    const { layer } = makeLayer()
    return Effect.gen(function* () {
      const artifacts = yield* JiraMigrationArtifacts
      const schema = Schema.Struct({ body: Schema.String })
      const ref = yield* artifacts.writeJson("acme", coordinates, {
        body: "safe"
      })

      expect(yield* artifacts.readJson("acme", ref, schema)).toEqual({
        body: "safe"
      })
      expect(
        (yield* Effect.result(
          artifacts.readJson(
            "acme",
            { ...ref, byteSize: ref.byteSize + 1 },
            schema
          )
        ))._tag
      ).toBe("Failure")
      expect(
        (yield* Effect.result(
          artifacts.readJson("acme", { ...ref, sha256: "wrong" }, schema)
        ))._tag
      ).toBe("Failure")
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    "lists logical keys and deletes every exact key under a prefix",
    () => {
      const { deleted, layer, objects } = makeLayer()
      objects.set(
        "tenant-a/migrations/jira/m1/scan-3/raw/a.json",
        new Uint8Array()
      )
      objects.set(
        "tenant-a/migrations/jira/m1/scan-3/raw/b.json",
        new Uint8Array()
      )
      objects.set(
        "tenant-a/migrations/jira/m2/scan-1/raw/c.json",
        new Uint8Array()
      )

      return Effect.gen(function* () {
        const artifacts = yield* JiraMigrationArtifacts
        const prefix = "migrations/jira/m1/scan-3/"

        expect(yield* artifacts.listPrefix("acme", prefix)).toEqual([
          "migrations/jira/m1/scan-3/raw/a.json",
          "migrations/jira/m1/scan-3/raw/b.json"
        ])
        yield* artifacts.deletePrefix("acme", prefix)

        expect(deleted.toSorted()).toEqual([
          "tenant-a/migrations/jira/m1/scan-3/raw/a.json",
          "tenant-a/migrations/jira/m1/scan-3/raw/b.json"
        ])
        expect([...objects.keys()]).toEqual([
          "tenant-a/migrations/jira/m2/scan-1/raw/c.json"
        ])
      }).pipe(Effect.provide(layer))
    }
  )
})
