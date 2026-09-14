import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { JiraMigrations, JiraMigrationsLive } from "./Migrations"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("JiraMigrations Postgres", () => {
  let pool: Pool
  let layer: Layer.Layer<JiraMigrations>
  const userIds: Array<string> = []
  const organizationIds: Array<string> = []

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Jira tests require an isolated local test database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
    const database = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl as string) })
      )
    )
    layer = JiraMigrationsLive.pipe(Layer.provide(database), Layer.orDie)
  })

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await pool.query('delete from "organization" where id = $1', [
        organizationId
      ])
    }
    for (const userId of userIds) {
      await pool.query('delete from "user" where id = $1', [userId])
    }
    await pool.end()
  })

  const createOwner = async () => {
    const userId = randomUUID()
    const organizationId = randomUUID()
    userIds.push(userId)
    organizationIds.push(organizationId)
    await pool.query(
      'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, false, now(), now())',
      [userId, "Jira migration test", `${userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id, name, slug, created_at) values ($1, $2, $3, now())',
      [organizationId, "Jira org", `jira-${organizationId}`]
    )
    return { userId, organizationId }
  }

  const source = {
    cloudId: "cloud-1",
    siteName: "Example",
    siteUrl: "https://example.atlassian.net",
    projectId: "10000",
    projectKey: "APP",
    projectName: "Application"
  }

  it("creates idempotently and rejects request id reuse for another source", async () => {
    const owner = await createOwner()
    const requestId = randomUUID()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        const first = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          requestId,
          source
        )
        const replay = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          requestId,
          source
        )
        const conflict = yield* Effect.result(
          migrations.create(owner.organizationId, owner.userId, requestId, {
            ...source,
            projectId: "20000"
          })
        )
        return { first, replay, conflict }
      }).pipe(Effect.provide(layer))
    )

    expect(result.replay.id).toBe(result.first.id)
    expect(result.first.status).toBe("scanning")
    expect(result.conflict).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "Conflict",
        reason: "jira_migration_request_conflict"
      }
    })
  })

  it("coalesces concurrent creation retries to one job", async () => {
    const owner = await createOwner()
    const requestId = randomUUID()
    const jobs = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        return yield* Effect.all(
          Array.from({ length: 6 }, () =>
            migrations.create(
              owner.organizationId,
              owner.userId,
              requestId,
              source
            )
          ),
          { concurrency: "unbounded" }
        )
      }).pipe(Effect.provide(layer))
    )

    expect(new Set(jobs.map(({ id }) => id))).toHaveLength(1)
  })

  it("uses expected revisions for lifecycle mutations", async () => {
    const owner = await createOwner()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const migrations = yield* JiraMigrations
        const created = yield* migrations.create(
          owner.organizationId,
          owner.userId,
          randomUUID(),
          source
        )
        const cancelling = yield* migrations.cancel(
          owner.organizationId,
          owner.userId,
          created.id,
          created.revision
        )
        const stale = yield* Effect.result(
          migrations.cancel(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision
          )
        )
        return { cancelling, stale }
      }).pipe(Effect.provide(layer))
    )

    expect(result.cancelling).toMatchObject({
      status: "cancelling",
      revision: 1
    })
    expect(result.stale).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "Conflict",
        reason: "jira_migration_revision_conflict"
      }
    })
  })
})
