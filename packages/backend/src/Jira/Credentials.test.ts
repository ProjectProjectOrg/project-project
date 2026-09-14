import { createHash, randomBytes, randomUUID } from "node:crypto"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { PgClient } from "@effect/sql-pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import { DbLive } from "../Layers/Db"
import { SecretCryptoLive } from "../Layers/SecretCrypto"
import { JiraCredentialsLive } from "./Credentials"
import { JiraCredentials } from "./Credentials"
import {
  JIRA_SCOPES,
  JiraOAuthConfig,
  JiraTokenEndpoint,
  type JiraTokenGrant
} from "./OAuth"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("JiraCredentials Postgres", () => {
  const userIds: Array<string> = []
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
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
  })

  afterAll(async () => {
    for (const userId of userIds) {
      await pool.query('delete from "user" where id = $1', [userId])
    }
    await pool.end()
  })

  const makeRuntime = async (input?: {
    readonly scopes?: ReadonlyArray<string>
    readonly refreshDelay?: string
  }) => {
    const refreshCalls = await Effect.runPromise(Ref.make(0))
    const grant = (
      accessToken: string,
      refreshToken: string
    ): JiraTokenGrant => ({
      accessToken,
      refreshToken,
      expiresAt: DateTime.toDate(
        DateTime.add(DateTime.nowUnsafe(), { hours: 1 })
      ),
      grantedScopes: input?.scopes ?? JIRA_SCOPES.split(" ")
    })
    const endpoint = JiraTokenEndpoint.of({
      exchange: () => Effect.succeed(grant("access-plain", "refresh-plain")),
      refresh: () =>
        Effect.gen(function* () {
          yield* Ref.update(refreshCalls, (value) => value + 1)
          if (input?.refreshDelay) yield* Effect.sleep(50)
          return grant("access-rotated", "refresh-rotated")
        })
    })
    const database = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl as string) })
      )
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
      Layer.provide(SecretCryptoLive),
      Layer.provide(database)
    )
    return { runtime: Effect.runPromise, layer, refreshCalls }
  }

  it("stores only a hash of state and consumes it once for the initiating user", async () => {
    const userId = await insertUser()
    const otherUserId = await insertUser()
    const { layer } = await makeRuntime()
    const begin = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* credentials.beginConnect(userId, "/profile?tab=jira")
      }).pipe(Effect.provide(layer))
    )
    const authorizeUrl = new URL(begin.authorizeUrl)
    const state = authorizeUrl.searchParams.get("state") as string
    const row = await pool.query(
      "select state_hash, return_path, consumed_at from user_jira_oauth_state where user_id = $1",
      [userId]
    )

    expect(row.rows[0].state_hash).toBe(
      createHash("sha256").update(state).digest("hex")
    )
    expect(JSON.stringify(row.rows[0])).not.toContain(state)
    expect(row.rows[0].return_path).toBe("/profile?tab=jira")

    const wrongUser = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* Effect.result(
          credentials.completeConnect(otherUserId, "code", state)
        )
      }).pipe(Effect.provide(layer))
    )
    expect(wrongUser._tag).toBe("Failure")

    const connected = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* credentials.completeConnect(userId, "code", state)
      }).pipe(Effect.provide(layer))
    )
    expect(connected.status).toBe("connected")

    const replay = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* Effect.result(
          credentials.completeConnect(userId, "code", state)
        )
      }).pipe(Effect.provide(layer))
    )
    expect(replay._tag).toBe("Failure")
  })

  it("persists encrypted tokens and disconnects locally", async () => {
    const userId = await insertUser()
    const { layer } = await makeRuntime()
    await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        const { authorizeUrl } = yield* credentials.beginConnect(
          userId,
          "/profile"
        )
        const state = new URL(authorizeUrl).searchParams.get("state") as string
        yield* credentials.completeConnect(userId, "code", state)
      }).pipe(Effect.provide(layer))
    )
    const stored = await pool.query(
      "select * from user_jira_integration where user_id = $1",
      [userId]
    )
    expect(JSON.stringify(stored.rows[0])).not.toContain("access-plain")
    expect(JSON.stringify(stored.rows[0])).not.toContain("refresh-plain")

    const disconnected = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* credentials.disconnect(userId)
      }).pipe(Effect.provide(layer))
    )
    expect(disconnected.status).toBe("disconnected")
    expect(
      (
        await pool.query(
          "select 1 from user_jira_integration where user_id = $1",
          [userId]
        )
      ).rowCount
    ).toBe(0)
  })

  it("serializes concurrent refresh and persists the rotated token", async () => {
    const userId = await insertUser()
    const { layer, refreshCalls } = await makeRuntime({
      refreshDelay: "50 millis"
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        const { authorizeUrl } = yield* credentials.beginConnect(
          userId,
          "/profile"
        )
        const state = new URL(authorizeUrl).searchParams.get("state") as string
        yield* credentials.completeConnect(userId, "code", state)
      }).pipe(Effect.provide(layer))
    )
    await pool.query(
      "update user_jira_integration set expires_at = now() - interval '1 minute' where user_id = $1",
      [userId]
    )
    const tokens = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        return yield* Effect.all(
          [
            credentials.accessTokenFor(userId),
            credentials.accessTokenFor(userId)
          ],
          { concurrency: "unbounded" }
        )
      }).pipe(Effect.provide(layer))
    )
    expect(tokens.map((token) => Redacted.value(token.token))).toEqual([
      "access-rotated",
      "access-rotated"
    ])
    expect(await Effect.runPromise(Ref.get(refreshCalls))).toBe(1)
  })

  it("marks a grant with missing scopes reconnect-required", async () => {
    const userId = await insertUser()
    const { layer } = await makeRuntime({
      scopes: JIRA_SCOPES.split(" ").filter(
        (scope) => scope !== "offline_access"
      )
    })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* JiraCredentials
        const { authorizeUrl } = yield* credentials.beginConnect(
          userId,
          "/profile"
        )
        const state = new URL(authorizeUrl).searchParams.get("state") as string
        return yield* Effect.result(
          credentials.completeConnect(userId, "code", state)
        )
      }).pipe(Effect.provide(layer))
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toMatchObject({
        _tag: "JiraReconnectRequired",
        reason: "missing_scopes"
      })
    }
  })
})
