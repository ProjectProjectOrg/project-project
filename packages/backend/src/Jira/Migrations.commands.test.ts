import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { JiraMigrationConfiguration, JiraMigrationRequirements, Conflict } from "@projectproject/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { DateTime, Deferred, Effect, Fiber, Layer, Redacted, Schema } from "effect"
import { ClusterWorkflowEngine, SingleRunner } from "effect/unstable/cluster"
import { SqlClient } from "effect/unstable/sql"
import { DurableDeferred, WorkflowEngine } from "effect/unstable/workflow"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { JiraMigrationProjection, fenceFor } from "./MigrationProjection"
import { JiraMigrationWorkflow, startImportDeferred } from "./MigrationWorkflow"
import { submitJiraMigrationRun } from "./Migrations"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const configuration = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
  destination: { name: "Application", slug: "application", key: "APP" },
  identities: [], statuses: [], issueTypes: [], priorities: [], tags: [], activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" }, skippedAttachmentIds: [], attachmentSkipsAccepted: false
})
const source = { cloudId: "cloud", siteName: "Example", siteUrl: "https://example.atlassian.net", projectId: "1", projectKey: "APP", projectName: "Application" }
const scan = {
  manifest: { key: "manifest.json", sha256: "a".repeat(64), byteSize: 10, contentType: "application/json" },
  requirements: Schema.decodeUnknownSync(JiraMigrationRequirements)({
    destination: { suggestedName: "Application", suggestedSlug: "application", suggestedKey: "APP" }, identities: [], identityOptions: [], statuses: [], statusOptions: [], issueTypes: [], priorities: [], tags: [], activeFutureSprintChoices: [], restrictedContent: { issueCount: 0, commentCount: 0, worklogCount: 0 }, attachments: []
  }),
  summary: { siteName: "Example", siteUrl: "https://example.atlassian.net", projectName: "Application", projectKey: "APP", scannedAt: DateTime.makeUnsafe("2026-09-22T00:00:00Z"), counts: { identities: 0, statuses: 0, issueTypes: 0, priorities: 0, tags: 0, issues: 0, comments: 0, attachments: 0, groups: 0, restrictions: 0 }, visibilityWarnings: [] }
}

describe.skipIf(!databaseUrl)("atomic Jira durable commands", () => {
  let pool: Pool
  let base: Layer.Layer<JiraMigrationProjection | SqlClient.SqlClient | WorkflowEngine.WorkflowEngine>
  const owners: Array<{ organizationId: string; userId: string }> = []
  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/projectproject_effect_v4_t172") throw new Error("Isolated database required")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder: `${import.meta.dirname}/../db/migrations` })
    const pg = PgClient.layer({ url: Redacted.make(databaseUrl!) })
    const projection = JiraMigrationProjection.layer.pipe(Layer.provide(DbLive))
    const engine = ClusterWorkflowEngine.layer.pipe(Layer.provide(SingleRunner.layer({ runnerStorage: "memory", shardingConfig: { shardsPerGroup: 1, entityMessagePollInterval: "20 millis", entityReplyPollInterval: "20 millis" } })), Layer.provide(BunCrypto.layer))
    base = Layer.mergeAll(projection, engine).pipe(Layer.provideMerge(pg), Layer.orDie)
  })
  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('delete from "organization" where id = $1', [owner.organizationId])
      await pool.query('delete from "user" where id = $1', [owner.userId])
    }
    await pool.end()
  })
  const fixture = async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query('insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())', [owner.userId, `${owner.userId}@example.test`])
    await pool.query('insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())', [owner.organizationId])
    return owner
  }

  it("rolls back acceptance and a submitted SQL deferred without releasing or poisoning the gate", async () => {
    const owner = await fixture()
    await Effect.runPromise(Effect.gen(function* () {
      const p = yield* JiraMigrationProjection
      const sql = yield* SqlClient.SqlClient
      const scanned = yield* Deferred.make<string>()
      const released = yield* Deferred.make<void>()
      const workflow = JiraMigrationWorkflow.toLayer((payload, executionId) => Effect.gen(function* () {
        if (payload.command._tag !== "Create") return yield* Effect.die("unexpected rescan")
        const row = yield* p.ensureCreated({ ...payload.command, executionId }).pipe(Effect.orDie)
        yield* p.completeScan(fenceFor(row)!, scan).pipe(Effect.orDie)
        yield* Deferred.succeed(scanned, row.id)
        yield* DurableDeferred.await(startImportDeferred(1))
        yield* Deferred.succeed(released, undefined)
        return { migrationId: row.id }
      }))
      yield* Effect.gen(function* () {
        yield* JiraMigrationWorkflow.execute({ command: { _tag: "Create", ...owner, requestId: randomUUID(), source } }, { discard: true })
        const id = yield* Deferred.await(scanned)
        const row = yield* p.owned(owner, id)
        const ready = yield* p.saveConfiguration({ owner, migrationId: id, expectedRevision: row.revision, configuration })
        const input = { owner, migrationId: id, expectedRevision: ready.revision }
        const submitted = yield* Deferred.make<void>()
        const rollback = yield* Deferred.make<void>()
        const transaction = yield* sql.withTransaction(Effect.gen(function* () {
          yield* submitJiraMigrationRun(input)
          yield* Deferred.succeed(submitted, undefined)
          yield* Deferred.await(rollback)
          return yield* new Conflict({ reason: "force_rollback" })
        })).pipe(Effect.result, Effect.forkChild)
        yield* Deferred.await(submitted)
        const outside = yield* Effect.promise(() => pool.query("select status, revision, checkpoint from jira_migration where id = $1", [id]))
        expect(outside.rows[0]).toMatchObject({ status: "ready", revision: ready.revision })
        yield* Effect.sleep("100 millis")
        expect(yield* Deferred.isDone(released)).toBe(false)
        yield* Deferred.succeed(rollback, undefined)
        expect(yield* Fiber.join(transaction)).toMatchObject({ _tag: "Failure" })
        expect(yield* p.owned(owner, id)).toMatchObject({ status: "ready", revision: ready.revision })
        yield* submitJiraMigrationRun(input)
        yield* Deferred.await(released).pipe(Effect.timeout("5 seconds"))
        expect((yield* p.owned(owner, id)).status).toBe("migrating")
        expect(yield* Effect.result(submitJiraMigrationRun(input))).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
      }).pipe(Effect.provide(workflow))
    }).pipe(Effect.provide(base), Effect.scoped))
  }, 20000)
})
