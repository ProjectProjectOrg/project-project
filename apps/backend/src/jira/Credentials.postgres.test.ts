// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash, randomBytes, randomUUID } from "node:crypto"

import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { DbLive } from "@pp/db"
import { JiraCredentialsLive } from "@pp/server-core/jira/Credentials"
import { JiraCredentials } from "@pp/server-core/jira/Credentials"
import {
  JIRA_SCOPES,
  JiraOAuthConfig,
  JiraTokenEndpoint,
  type JiraTokenGrant
} from "@pp/server-core/jira/OAuth"
import { SecretCryptoLive } from "@pp/server-core/storage/SecretCryptoLive"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { JiraHostLive } from "./HostLive"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("JiraCredentials Postgres", () => {
  const userIds: Array<string> = []
  const previousEncryptionKey = process.env.USER_SECRET_ENCRYPTION_KEY
  let pool: Pool

  const insertUser = async () => {
    const id = randomUUID()
    userIds.push(id)
    await pool.query(
      'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, false, now(), now())',
      [id, "Jira test", `${id}@example.test`]
    )
    return id
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Jira tests require an isolated local test database")
    }
    process.env.USER_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../../../../packages/db/src/migrations`
    })
  })

  afterAll(async () => {
    if (previousEncryptionKey === undefined)
      delete process.env.USER_SECRET_ENCRYPTION_KEY
    else process.env.USER_SECRET_ENCRYPTION_KEY = previousEncryptionKey
    for (const userId of userIds) {
      await pool.query('delete from "user" where id = $1', [userId])
    }
    await pool.end()
  })

  const makeTestLayer = Effect.fnUntraced(function* (
    input?: Readonly<{
      scopes?: ReadonlyArray<string>
      refreshDelay?: string
    }>
  ) {
    if (!databaseUrl) return yield* Effect.die("Test database URL is required")
    const refreshCalls = yield* Ref.make(0)
    const refreshEntered = yield* Deferred.make<void>()
    const now = yield* DateTime.now
    const grant = (
      accessToken: string,
      refreshToken: string
    ): JiraTokenGrant => ({
      accessToken,
      refreshToken,
      expiresAt: DateTime.toDate(DateTime.add(now, { hours: 1 })),
      grantedScopes: input?.scopes ?? JIRA_SCOPES.split(" ")
    })
    const endpoint = JiraTokenEndpoint.of({
      exchange: () => Effect.succeed(grant("access-plain", "refresh-plain")),
      refresh: () =>
        Effect.gen(function* () {
          yield* Ref.update(refreshCalls, (value) => value + 1)
          yield* Deferred.succeed(refreshEntered, undefined)
          if (input?.refreshDelay) yield* Effect.sleep(50)
          return grant("access-rotated", "refresh-rotated")
        })
    })
    const database = DbLive.pipe(
      Layer.provideMerge(PgClient.layer({ url: Redacted.make(databaseUrl) }))
    )
    const layer = JiraCredentialsLive.pipe(
      Layer.provide(Layer.succeed(JiraTokenEndpoint, endpoint)),
      Layer.provide(
        Layer.succeed(JiraOAuthConfig, {
          clientId: "jira-client",
          clientSecret: Redacted.make("jira-secret"),
          publicBaseUrl: "https://app.example"
        })
      ),
      Layer.provide(JiraHostLive.pipe(Layer.provide(SecretCryptoLive))),
      Layer.provide(BunCrypto.layer),
      Layer.provide(database)
    )
    return { layer, refreshCalls, refreshEntered }
  })

  it.effect(
    "stores only a hash of state and consumes it once for the initiating user",
    () =>
      Effect.gen(function* () {
        const userId = yield* Effect.promise(() => insertUser())
        const otherUserId = yield* Effect.promise(() => insertUser())
        const { layer } = yield* makeTestLayer()
        const begin = yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          return yield* credentials.beginConnect(userId, "/profile?tab=jira")
        }).pipe(Effect.provide(layer))
        const authorizeUrl = new URL(begin.authorizeUrl)
        const state = Option.getOrThrow(
          Option.fromNullishOr(authorizeUrl.searchParams.get("state"))
        )
        const row = yield* Effect.promise(() =>
          pool.query(
            "select state_hash, return_path, consumed_at from user_jira_oauth_state where user_id = $1",
            [userId]
          )
        )
        expect(row.rows[0].state_hash).toBe(
          createHash("sha256").update(state).digest("hex")
        )
        expect(encodeJson(row.rows[0])).not.toContain(state)
        expect(row.rows[0].return_path).toBe("/profile?tab=jira")
        const wrongUser = yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          return yield* Effect.result(
            credentials.completeConnect(otherUserId, "code", state)
          )
        }).pipe(Effect.provide(layer))
        expect(wrongUser._tag).toBe("Failure")
        const connected = yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          return yield* credentials.completeConnect(userId, "code", state)
        }).pipe(Effect.provide(layer))
        expect(connected.status).toBe("connected")
        const replay = yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          return yield* Effect.result(
            credentials.completeConnect(userId, "code", state)
          )
        }).pipe(Effect.provide(layer))
        expect(replay._tag).toBe("Failure")
      })
  )

  it.effect("persists encrypted tokens and disconnects locally", () =>
    Effect.gen(function* () {
      const userId = yield* Effect.promise(() => insertUser())
      const { layer } = yield* makeTestLayer()
      yield* Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        const { authorizeUrl } = yield* credentials.beginConnect(
          userId,
          "/profile"
        )
        const state = Option.getOrThrow(
          Option.fromNullishOr(new URL(authorizeUrl).searchParams.get("state"))
        )
        yield* credentials.completeConnect(userId, "code", state)
      }).pipe(Effect.provide(layer))
      const stored = yield* Effect.promise(() =>
        pool.query("select * from user_jira_integration where user_id = $1", [
          userId
        ])
      )
      expect(encodeJson(stored.rows[0])).not.toContain("access-plain")
      expect(encodeJson(stored.rows[0])).not.toContain("refresh-plain")
      const disconnected = yield* Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* credentials.disconnect(userId)
      }).pipe(Effect.provide(layer))
      expect(disconnected.status).toBe("disconnected")
      expect(
        (yield* Effect.promise(() =>
          pool.query("select 1 from user_jira_integration where user_id = $1", [
            userId
          ])
        )).rowCount
      ).toBe(0)
    })
  )

  it.effect(
    "serializes concurrent refresh and persists the rotated token",
    () =>
      Effect.gen(function* () {
        const userId = yield* Effect.promise(() => insertUser())
        const { layer, refreshCalls, refreshEntered } = yield* makeTestLayer({
          refreshDelay: "50 millis"
        })
        yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          const { authorizeUrl } = yield* credentials.beginConnect(
            userId,
            "/profile"
          )
          const state = Option.getOrThrow(
            Option.fromNullishOr(
              new URL(authorizeUrl).searchParams.get("state")
            )
          )
          yield* credentials.completeConnect(userId, "code", state)
        }).pipe(Effect.provide(layer))
        const expiredAt = DateTime.toDate(
          DateTime.subtract(yield* DateTime.now, { minutes: 1 })
        )
        yield* Effect.promise(() =>
          pool.query(
            "update user_jira_integration set expires_at = $2 where user_id = $1",
            [userId, expiredAt]
          )
        )
        const tokens = yield* Effect.gen(function* () {
          const credentials = yield* JiraCredentials
          const first = yield* Effect.forkChild(
            credentials.accessTokenFor(userId)
          )
          yield* Deferred.await(refreshEntered)
          const second = yield* Effect.forkChild(
            credentials.accessTokenFor(userId)
          )
          yield* TestClock.adjust("50 millis")
          const firstToken = yield* Fiber.join(first)
          yield* TestClock.adjust("1 second")
          return [firstToken, yield* Fiber.join(second)]
        }).pipe(Effect.provide(layer))
        expect(tokens.map((token) => Redacted.value(token.token))).toEqual([
          "access-rotated",
          "access-rotated"
        ])
        expect(yield* Ref.get(refreshCalls)).toBe(1)
      })
  )

  it.effect("marks a grant with missing scopes reconnect-required", () =>
    Effect.gen(function* () {
      const userId = yield* Effect.promise(() => insertUser())
      const { layer } = yield* makeTestLayer({
        scopes: JIRA_SCOPES.split(" ").filter(
          (scope) => scope !== "offline_access"
        )
      })
      const result = yield* Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        const { authorizeUrl } = yield* credentials.beginConnect(
          userId,
          "/profile"
        )
        const state = Option.getOrThrow(
          Option.fromNullishOr(new URL(authorizeUrl).searchParams.get("state"))
        )
        return yield* Effect.result(
          credentials.completeConnect(userId, "code", state)
        )
      }).pipe(Effect.provide(layer))
      assertTrue(Result.isFailure(result))
      expect(result.failure).toMatchObject({
        _tag: "JiraReconnectRequired",
        reason: "missing_scopes"
      })
    })
  )
})
