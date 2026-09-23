import { randomUUID } from "node:crypto"
import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { ConfigProvider, Effect, Layer, Redacted, Schedule } from "effect"
import { WorkflowEngine } from "effect/unstable/workflow"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { MarkdownLive } from "../Layers/Markdown"
import { OrgStorage } from "../Services/OrgStorage"
import { S3Storage } from "../Services/S3Storage"
import { JiraMigrationProjection } from "./MigrationProjection"
import { makeJiraProductionActivities } from "./MigrationProduction"
import {
  JiraMigrationWorkflow,
  makeJiraMigrationWorkflow
} from "./MigrationWorkflow"
import { makeScanTestLayer } from "./ScanTestSupport"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("Jira production workflow composition", () => {
  let pool: Pool
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

  it("scans through the registered production activities and stops at configuration", async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$2,$3,false,now(),now())',
      [owner.userId, "", `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$2,$3,now())',
      [owner.organizationId, "Example", owner.organizationId]
    )
    await pool.query(
      'insert into "member" (id,organization_id,user_id,role,created_at) values ($1,$2,$3,$4,now())',
      [randomUUID(), owner.organizationId, owner.userId, "owner"]
    )
    const fixture = makeScanTestLayer()
    const pg = PgClient.layer({ url: Redacted.make(databaseUrl!) })
    const projection = JiraMigrationProjection.layer.pipe(
      Layer.provideMerge(DbLive)
    )
    const fakeStorage = Layer.mergeAll(
      Layer.succeed(
        OrgStorage,
        OrgStorage.of({
          getStatus: () => Effect.die("unused"),
          connect: () => Effect.die("unused"),
          disconnect: () => Effect.die("unused"),
          requireConnection: () => Effect.die("unused")
        })
      ),
      Layer.succeed(
        S3Storage,
        S3Storage.of({
          putObject: () => Effect.die("unused"),
          getObject: () => Effect.die("unused"),
          listObjectKeys: () => Effect.die("unused"),
          deleteObject: () => Effect.die("unused"),
          presignPut: () => Effect.die("unused"),
          presignGet: () => Effect.die("unused"),
          headObject: () => Effect.die("unused"),
          checkConnection: () => Effect.die("unused")
        })
      )
    )
    const workflow = Layer.unwrap(
      Effect.map(makeJiraProductionActivities, makeJiraMigrationWorkflow)
    )
    const layer = workflow.pipe(
      Layer.provideMerge(
        MarkdownLive.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ PROJECTS_DIR: "/tmp" })
            )
          )
        )
      ),
      Layer.provideMerge(BunServices.layer),
      Layer.provideMerge(projection),
      Layer.provideMerge(fixture.layer),
      Layer.provideMerge(fakeStorage),
      Layer.provideMerge(WorkflowEngine.layerMemory),
      Layer.provideMerge(pg)
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const migrationId = yield* JiraMigrationWorkflow.execute(
          {
            command: {
              _tag: "Create",
              ...owner,
              requestId: randomUUID(),
              source: {
                cloudId: "cloud-1",
                siteName: "Example",
                siteUrl: "https://example.atlassian.net",
                projectId: "10000",
                projectKey: "APP",
                projectName: "Application"
              }
            }
          },
          { discard: true }
        )
        const row = yield* projection.owned(owner, migrationId).pipe(
          Effect.retry({ schedule: Schedule.spaced("10 millis") }),
          Effect.repeat({
            while: (current) => current.status === "scanning",
            schedule: Schedule.spaced("10 millis")
          }),
          Effect.timeout("10 seconds")
        )
        expect(row.status).toBe("needs_configuration")
        const requestCount = fixture.requests.length
        yield* JiraMigrationWorkflow.resume(migrationId)
        const resumed = yield* projection.owned(owner, migrationId)
        return { row: resumed, requestCount }
      }).pipe(Effect.provide(layer))
    )
    expect(result.row.status).toBe("needs_configuration")
    expect(result.row.destinationProjectId).toBeNull()
    expect(result.row.checkpoint).toMatchObject({
      scan: { manifest: { key: expect.stringContaining("manifest-v2") } }
    })
    expect(result.requestCount).toBeGreaterThan(0)
    expect(fixture.requests).toHaveLength(result.requestCount)
  })
})
