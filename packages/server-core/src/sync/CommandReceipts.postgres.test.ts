// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import pg from "pg"
import { describe, expect } from "vitest"

import { SyncOperation } from "./ChangeOrigin"
import * as CommandReceipts from "./CommandReceipts"
import * as SyncLog from "./SyncLog"

const { Client } = pg
const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  ) {
    throw new Error("Test requires an isolated local database")
  }
  process.env.DATABASE_URL = databaseUrl
}

const TestLayer = CommandReceipts.layer.pipe(
  Layer.provideMerge(SyncLog.layer),
  Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
)

const withClient = <A>(use: (client: pg.Client) => Promise<A>) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return await use(client)
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const seed = Effect.gen(function* () {
  const organizationId = `receipts-${randomUUID()}`
  const projectId = randomUUID()
  const userId = `receipts-${randomUUID()}`
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [organizationId]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Receipts', 'folder', 'blue', 'test-user', now())",
      [projectId, organizationId]
    )
    await client.query(
      `insert into "user" (id, name, email, created_at, updated_at) values ($1, 'Test', $1, now(), now())`,
      [userId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        organizationId
      ])
      await client.query(`delete from "user" where id = $1`, [userId])
    })
  )
  return {
    projectId,
    key: { userId, operationId: `op-${randomUUID()}` }
  }
})

const outcome = { status: 200, contentType: "application/json", body: "{}" }
const ticket = (id: string) => [{ kind: "ticket", id, op: "upsert" }] as const

describe.skipIf(!databaseUrl)("CommandReceipts Postgres", () => {
  it.effect(
    "replays a completed operation with the sequence it produced, even after the log is rebuilt",
    () =>
      Effect.gen(function* () {
        const receipts = yield* CommandReceipts.CommandReceipts
        const log = yield* SyncLog.SyncLog
        const { projectId, key } = yield* seed

        expect(yield* receipts.claim(key, "hash")).toEqual({ kind: "claimed" })
        yield* log.append(projectId, ticket("T-1"))
        yield* log
          .append(projectId, ticket("T-2"))
          .pipe(Effect.provideService(SyncOperation, key.operationId))
        yield* log
          .append(projectId, ticket("T-3"))
          .pipe(Effect.provideService(SyncOperation, key.operationId))
        yield* log.append(projectId, ticket("T-4"))
        const receipt = yield* receipts.complete(key, outcome)
        expect(receipt).toBe(`${projectId}.1.3`)

        yield* log.bumpGeneration(projectId)
        expect(yield* receipts.claim(key, "hash")).toEqual({
          kind: "done",
          outcome,
          receipt
        })
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect(
    "rejects a different request under the same id and reports an unfinished one as pending",
    () =>
      Effect.gen(function* () {
        const receipts = yield* CommandReceipts.CommandReceipts
        const { key } = yield* seed

        yield* receipts.claim(key, "hash")
        expect(yield* receipts.claim(key, "other")).toEqual({
          kind: "mismatch"
        })
        expect(yield* receipts.claim(key, "hash")).toEqual({ kind: "pending" })
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("lets a released operation run again", () =>
    Effect.gen(function* () {
      const receipts = yield* CommandReceipts.CommandReceipts
      const { key } = yield* seed

      yield* receipts.claim(key, "hash")
      yield* receipts.release(key)
      expect(yield* receipts.claim(key, "hash")).toEqual({ kind: "claimed" })
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )
})
