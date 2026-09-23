import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { Db } from "./Db"
import { DbLive } from "./live"
import { relations, user } from "./schema"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)(
  "Promise and Effect database compatibility",
  () => {
    const id = randomUUID()
    let pool: Pool
    const dbLayer = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
    )

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Test database URL is required")
      const url = new URL(databaseUrl)
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        !url.pathname.startsWith("/projectproject_effect_v4_")
      ) {
        throw new Error(
          "Database compatibility tests require an isolated local test database"
        )
      }
      pool = new Pool({ connectionString: databaseUrl })
      await migrate(drizzle({ client: pool }), {
        migrationsFolder: `${import.meta.dirname}/migrations`
      })
    })

    afterAll(async () => {
      if (pool) {
        await pool.query('DELETE FROM "user" WHERE id = $1', [id])
        await pool.end()
      }
    })

    it.effect(
      "reads Promise inserts through Effect and preserves timestamp types",
      () =>
        Effect.gen(function* () {
          const promiseDb = drizzle({ client: pool, relations })
          const now = DateTime.toDate(
            DateTime.makeUnsafe("2026-09-07T12:34:56.000Z")
          )
          yield* Effect.promise(() =>
            promiseDb.insert(user).values({
              id,
              name: "Driver compatibility",
              email: `${id}@example.test`,
              createdAt: now,
              updatedAt: now
            })
          )
          const row = yield* Effect.gen(function* () {
            const db = yield* Db
            return yield* db.query.user.findFirst({ where: { id } })
          }).pipe(Effect.provide(dbLayer))
          expect(row?.createdAt).toEqual(now)
          expect(row?.updatedAt).toEqual(now)
          expect(row?.name).toBe("Driver compatibility")
        })
    )

    it.effect(
      "reads Effect updates through the Promise driver and rolls back failed transactions",
      () =>
        Effect.gen(function* () {
          yield* Effect.gen(function* () {
            const db = yield* Db
            yield* db
              .update(user)
              .set({ name: "Effect update" })
              .where(eq(user.id, id))
            const result = yield* Effect.exit(
              db.transaction(() =>
                Effect.gen(function* () {
                  yield* db
                    .update(user)
                    .set({ name: "Rolled back" })
                    .where(eq(user.id, id))
                  return yield* Effect.fail("rollback")
                })
              )
            )
            expect(result._tag).toBe("Failure")
          }).pipe(Effect.provide(dbLayer))
          const row = yield* Effect.promise(() =>
            drizzle({ client: pool, relations }).query.user.findFirst({
              where: { id }
            })
          )
          expect(row?.name).toBe("Effect update")
        })
    )
  }
)
