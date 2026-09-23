import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { DbLive } from "@pp/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { OAuthApplications } from "./OAuthApplications"
import { OAuthApplicationsLive } from "./OAuthApplicationsLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const date = (value: string) => DateTime.toDate(DateTime.makeUnsafe(value))

describe.skipIf(!databaseUrl)("OAuth application service", () => {
  const userA = randomUUID()
  const userB = randomUUID()
  const clientRowId = randomUUID()
  const clientId = `oauth-client-${randomUUID()}`
  const consentA1 = randomUUID()
  const consentA2 = randomUUID()
  const consentB = randomUUID()
  const accessA = randomUUID()
  const refreshA = randomUUID()
  const dbLayer = OAuthApplicationsLive.pipe(
    Layer.provide(
      DbLive.pipe(
        Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
      )
    )
  )
  let pool: Pool

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error(
        "OAuth application tests require an isolated local test database"
      )
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder
    })

    const now = date("2026-09-07T12:00:00.000Z")
    await pool.query(
      `INSERT INTO "user" (id, name, email, created_at, updated_at)
       VALUES ($1, 'OAuth user A', $2, $3, $3), ($4, 'OAuth user B', $5, $3, $3)`,
      [userA, `${userA}@example.test`, now, userB, `${userB}@example.test`]
    )
    await pool.query(
      `INSERT INTO oauth_client (id, client_id, redirect_uris, created_at, name)
       VALUES ($1, $2, $3, $4, 'Test OAuth client')`,
      [clientRowId, clientId, ["http://localhost/callback"], now]
    )
    await pool.query(
      `INSERT INTO oauth_provider_consent
       (id, client_id, user_id, scopes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6), ($7, $2, $3, $4, $5, $8),
              ($9, $2, $10, $4, $5, $11)`,
      [
        consentA1,
        clientId,
        userA,
        ["openid"],
        now,
        date("2026-09-07T12:01:00.000Z"),
        consentA2,
        date("2026-09-07T12:02:00.000Z"),
        consentB,
        userB,
        date("2026-09-07T12:03:00.000Z")
      ]
    )
    await pool.query(
      `INSERT INTO oauth_provider_access_token
       (id, token, client_id, user_id, expires_at, created_at, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        accessA,
        `access-${accessA}`,
        clientId,
        userA,
        date("2026-09-08T12:00:00.000Z"),
        date("2026-09-07T12:04:00.000Z"),
        ["openid"]
      ]
    )
    await pool.query(
      `INSERT INTO oauth_refresh_token
       (id, token, client_id, user_id, expires_at, created_at, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        refreshA,
        `refresh-${refreshA}`,
        clientId,
        userA,
        date("2026-10-07T12:00:00.000Z"),
        date("2026-09-07T12:05:00.000Z"),
        ["openid"]
      ]
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM oauth_client WHERE id = $1", [clientRowId])
      await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [
        userA,
        userB
      ])
      await pool.end()
    }
  })

  it.effect(
    "deduplicates consent rows and reports the latest token issuance",
    () =>
      Effect.gen(function* () {
        const service = yield* OAuthApplications
        const applications = yield* service.listForUser(userA)
        expect(applications).toHaveLength(1)
        expect(applications[0]?.lastUsedAt).toEqual(
          date("2026-09-07T12:05:00.000Z")
        )
      }).pipe(Effect.provide(dbLayer))
  )

  it.effect(
    "orders refresh-only applications by last use and puts unused clients last",
    () =>
      Effect.gen(function* () {
        const older = randomUUID()
        const unused = randomUUID()
        try {
          for (const id of [older, unused]) {
            yield* Effect.promise(() =>
              pool.query(
                "INSERT INTO oauth_client (id, client_id, redirect_uris, created_at) VALUES ($1, $1, $2, now())",
                [id, ["http://localhost/callback"]]
              )
            )
            yield* Effect.promise(() =>
              pool.query(
                "INSERT INTO oauth_provider_consent (id, client_id, user_id, scopes, created_at, updated_at) VALUES ($1, $1, $2, $3, now(), now())",
                [id, userA, ["openid"]]
              )
            )
          }
          yield* Effect.promise(() =>
            pool.query(
              "INSERT INTO oauth_refresh_token (id, token, client_id, user_id, expires_at, created_at, scopes) VALUES ($1, $1, $1, $2, now(), $3, $4)",
              [older, userA, date("2026-09-07T12:03:00.000Z"), ["openid"]]
            )
          )
          const service = yield* OAuthApplications
          const applications = yield* service.listForUser(userA)
          expect(applications.map((application) => application.id)).toEqual([
            clientRowId,
            older,
            unused
          ])
          expect(applications[1]?.lastUsedAt).toEqual(
            date("2026-09-07T12:03:00.000Z")
          )
          expect(applications[2]?.lastUsedAt).toBeNull()
        } finally {
          yield* Effect.promise(() =>
            pool.query("DELETE FROM oauth_client WHERE id IN ($1, $2)", [
              older,
              unused
            ])
          )
        }
      }).pipe(Effect.provide(dbLayer))
  )

  it.effect("revokes only the requesting user's consent and tokens", () =>
    Effect.gen(function* () {
      const service = yield* OAuthApplications
      yield* service.revokeForUser(userA, clientRowId)
      const remaining = yield* service.listForUser(userB)
      expect(remaining).toHaveLength(1)
      const counts = yield* Effect.promise(() =>
        pool.query(
          `SELECT
         (SELECT count(*) FROM oauth_provider_access_token WHERE user_id = $1) AS access_count,
         (SELECT count(*) FROM oauth_refresh_token WHERE user_id = $1) AS refresh_count,
         (SELECT count(*) FROM oauth_provider_consent WHERE user_id = $1) AS consent_count`,
          [userA]
        )
      )
      expect(counts.rows[0]).toEqual({
        access_count: "0",
        refresh_count: "0",
        consent_count: "0"
      })
    }).pipe(Effect.provide(dbLayer))
  )
})
