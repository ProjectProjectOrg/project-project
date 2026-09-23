import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Effect, Layer, Redacted } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { Db } from "../Services/Db"
import { JiraMigrationProjection } from "./MigrationProjection"
import {
  selectExpiredJiraMigrations,
  selectPendingPostSuccessCleanup
} from "./Retention"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("Jira migration retention", () => {
  let pool: Pool
  let layer: Layer.Layer<JiraMigrationProjection | Db>
  const owners: Array<Readonly<{ organizationId: string; userId: string }>> = []

  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated database required")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
    const pg = PgClient.layer({ url: Redacted.make(databaseUrl!) })
    layer = JiraMigrationProjection.layer.pipe(
      Layer.provideMerge(DbLive),
      Layer.provideMerge(pg),
      Layer.orDie
    )
  })

  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('delete from "organization" where id = $1', [
        owner.organizationId
      ])
      await pool.query('delete from "user" where id = $1', [owner.userId])
    }
    await pool.end()
  })

  it("selects only expired terminal attempts with safe cleanup ownership", async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$2,$3,false,now(),now())',
      [owner.userId, "Retention", `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$2,$3,now())',
      [owner.organizationId, "Retention", owner.organizationId]
    )
    const ids = await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const create = (requestId: string) =>
          projection.ensureCreated({
            ...owner,
            requestId,
            executionId: randomUUID(),
            source: {
              cloudId: "cloud-1",
              siteName: "Example",
              siteUrl: "https://example.atlassian.net",
              projectId: "10000",
              projectKey: "APP",
              projectName: "Application"
            }
          })
        const eligible = yield* create(randomUUID())
        const future = yield* create(randomUUID())
        const active = yield* create(randomUUID())
        const uncertain = yield* create(randomUUID())
        for (const row of [eligible, future, uncertain]) {
          const fence = {
            migrationId: row.id,
            workflowExecutionId: row.workflowExecutionId!,
            workflowAttempt: row.workflowAttempt
          }
          if (row.id === uncertain.id)
            yield* projection.beginRemoteWrites(fence)
          yield* projection.recordFailure(fence, {
            reason: "retryable",
            retryable: true
          })
        }
        return { eligible, future, active, uncertain }
      }).pipe(Effect.provide(layer))
    )
    await pool.query(
      "update jira_migration set retained_until = now() - interval '1 day' where id = any($1)",
      [[ids.eligible.id, ids.uncertain.id]]
    )
    const commands = await Effect.runPromise(
      selectExpiredJiraMigrations.pipe(Effect.provide(layer))
    )
    expect(commands).toEqual([
      {
        migrationId: ids.eligible.id,
        workflowExecutionId: ids.eligible.workflowExecutionId,
        workflowAttempt: ids.eligible.workflowAttempt,
        expectedRevision: ids.eligible.revision + 1,
        mode: "expire"
      }
    ])
  })

  it("retries post-success cleanup until completion is recorded", async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$2,$3,false,now(),now())',
      [owner.userId, "Retention", `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$2,$3,now())',
      [owner.organizationId, "Retention", owner.organizationId]
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const created = yield* projection.ensureCreated({
          ...owner,
          requestId: randomUUID(),
          executionId: randomUUID(),
          source: {
            cloudId: "cloud-1",
            siteName: "Example",
            siteUrl: "https://example.atlassian.net",
            projectId: "10000",
            projectKey: "APP",
            projectName: "Application"
          }
        })
        const fence = {
          migrationId: created.id,
          workflowExecutionId: created.workflowExecutionId!,
          workflowAttempt: created.workflowAttempt
        }
        yield* Effect.promise(() =>
          pool.query(
            "update jira_migration set status = 'succeeded', checkpoint = $2::jsonb where id = $1",
            [
              created.id,
              {
                publishedPlan: {
                  planRef: {
                    key: "published-plan.json",
                    contentType: "application/json",
                    byteSize: 1,
                    sha256: "a".repeat(64)
                  },
                  publicationRevision: "b".repeat(64),
                  archive: {
                    path: `imports/jira/${created.id}/archive.json`,
                    sha256: "c".repeat(64)
                  }
                }
              }
            ]
          )
        )
        const pending = yield* selectPendingPostSuccessCleanup
        expect(pending).toEqual([
          { ...fence, expectedRevision: created.revision, mode: "post_success" }
        ])
        expect(
          yield* projection.claimCleanup(fence, {
            expectedRevision: created.revision,
            executionId: "first-cleanup",
            mode: "post_success"
          })
        ).toBe(true)
        expect(yield* selectPendingPostSuccessCleanup).toEqual([])
        expect(
          yield* projection.releaseCleanup(
            fence,
            "first-cleanup",
            "post_success"
          )
        ).toBe(true)
        expect(yield* selectPendingPostSuccessCleanup).toHaveLength(1)
        const retry = yield* projection.owned(owner, created.id)
        expect(
          yield* projection.claimCleanup(fence, {
            expectedRevision: retry.revision,
            executionId: "second-cleanup",
            mode: "post_success"
          })
        ).toBe(true)
        expect(
          yield* projection.completePostSuccessCleanup(fence, "second-cleanup")
        ).toBe(true)
        expect(yield* selectPendingPostSuccessCleanup).toEqual([])
      }).pipe(Effect.provide(layer))
    )
  })
})
