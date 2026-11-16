// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as SqlClient from "effect/sql/SqlClient"
import pg from "pg"
import { describe, expect } from "vitest"

import * as LiveChanges from "../live/LiveChanges"
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

const DatabaseLive = DbLive.pipe(Layer.provideMerge(PgLive))
const SyncTestLayer = LiveChanges.layer.pipe(
  Layer.provideMerge(SyncLog.layer),
  Layer.provideMerge(DatabaseLive)
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

const seedProject = Effect.gen(function* () {
  const organizationId = `sync-${randomUUID()}`
  const projectId = randomUUID()
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [organizationId]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Sync', 'folder', 'blue', 'test-user', now())",
      [projectId, organizationId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient((client) =>
      client.query("delete from organization where id = $1", [organizationId])
    )
  )
  return projectId
})

const ticket = (id: string) => [{ kind: "ticket", id, op: "upsert" }] as const

describe.skipIf(!databaseUrl)("SyncLog Postgres", () => {
  it.effect(
    "gives concurrent writers gap-free sequence numbers in commit order",
    () =>
      Effect.gen(function* () {
        const log = yield* SyncLog.SyncLog
        const projectId = yield* seedProject
        yield* Effect.all(
          Array.from({ length: 40 }, (_, n) =>
            log.append(projectId, ticket(`T-${n + 1}`))
          ),
          { concurrency: "unbounded" }
        )
        const entries = yield* log.entriesAfter(
          projectId,
          { generation: 1, sequence: 0 },
          100
        )
        expect(entries.map((entry) => entry.sequence)).toEqual(
          Array.from({ length: 40 }, (_, n) => n + 1)
        )
        expect(yield* log.head(projectId)).toEqual({
          generation: 1,
          sequence: 40
        })
      }).pipe(Effect.provide(SyncTestLayer))
  )

  it.effect(
    "drops an entry whose transaction rolls back, and a generation bump starts over",
    () =>
      Effect.gen(function* () {
        const log = yield* SyncLog.SyncLog
        const sql = yield* SqlClient.SqlClient
        const projectId = yield* seedProject
        yield* log.append(projectId, ticket("T-1"))
        yield* sql
          .withTransaction(
            log
              .append(projectId, ticket("T-2"))
              .pipe(Effect.andThen(Effect.fail("rolled back")))
          )
          .pipe(Effect.ignore)
        yield* log.append(projectId, ticket("T-3"))
        const entries = yield* log.entriesAfter(
          projectId,
          { generation: 1, sequence: 0 },
          10
        )
        expect(
          entries.map((entry) => [entry.sequence, entry.changes[0]?.id])
        ).toEqual([
          [1, "T-1"],
          [2, "T-3"]
        ])

        expect(yield* log.bumpGeneration(projectId)).toEqual({
          generation: 2,
          sequence: 0
        })
        expect(
          yield* log.entriesAfter(projectId, { generation: 1, sequence: 0 }, 10)
        ).toEqual([])
      }).pipe(Effect.provide(SyncTestLayer))
  )

  it.live("delivers committed entries to live listeners, and only those", () =>
    Effect.gen(function* () {
      const log = yield* SyncLog.SyncLog
      const live = yield* LiveChanges.LiveChanges
      const sql = yield* SqlClient.SqlClient
      const projectId = yield* seedProject
      const subscription = yield* live.subscribe
      yield* Effect.sleep("200 millis")

      yield* sql
        .withTransaction(
          log
            .append(projectId, ticket("T-9"))
            .pipe(Effect.andThen(Effect.fail("rolled back")))
        )
        .pipe(Effect.ignore)
      yield* log.append(projectId, ticket("T-1"))

      const delivered = yield* PubSub.take(subscription).pipe(
        Effect.timeout("5 seconds")
      )
      expect(delivered).toMatchObject({
        projectId,
        sequence: 1,
        changes: ticket("T-1"),
        reset: false
      })
    }).pipe(Effect.provide(SyncTestLayer))
  )
})
