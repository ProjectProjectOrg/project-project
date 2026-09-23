import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Effect, Layer, Redacted } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { projectIndex } from "../db/schema"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { ProjectDocs } from "../Services/ProjectDocs"
import { S3Storage } from "../Services/S3Storage"
import { JiraMigrationArtifacts } from "./MigrationArtifacts"
import { JiraMigrationProjection } from "./MigrationProjection"
import { makeJiraCleanupActivities } from "./CleanupOperations"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("Jira cleanup operations", () => {
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

  it("resets a hidden import without deleting its scan artifacts", async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$2,$3,false,now(),now())',
      [owner.userId, "Ada", `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$2,$3,now())',
      [owner.organizationId, "Example", owner.organizationId]
    )
    const removedObjects: string[] = []
    const removedDirectories: string[] = []
    const removedPrefixes: string[] = []
    const connection = {
      endpoint: "https://test.invalid",
      bucket: "test",
      region: "auto",
      keyPrefix: null,
      forcePathStyle: true,
      accessKeyId: "test",
      secretAccessKey: "test"
    }
    const fakes = Layer.mergeAll(
      Layer.succeed(
        OrgStorage,
        OrgStorage.of({
          getStatus: () => Effect.die("unused"),
          connect: () => Effect.die("unused"),
          disconnect: () => Effect.die("unused"),
          requireConnection: () => Effect.succeed(connection)
        })
      ),
      Layer.succeed(
        S3Storage,
        S3Storage.of({
          putObject: () => Effect.die("unused"),
          getObject: () => Effect.die("unused"),
          listObjectKeys: () => Effect.die("unused"),
          deleteObject: (_, key) =>
            Effect.sync(() => {
              removedObjects.push(key)
            }),
          presignPut: () => Effect.die("unused"),
          presignGet: () => Effect.die("unused"),
          headObject: () => Effect.die("unused"),
          checkConnection: () => Effect.die("unused")
        })
      ),
      Layer.succeed(
        ProjectDocs,
        ProjectDocs.of({
          read: () => Effect.die("unused"),
          write: () => Effect.die("unused"),
          readRaw: () => Effect.die("unused"),
          removeDir: (_orgSlug, slug) =>
            Effect.sync(() => {
              removedDirectories.push(slug)
            })
        })
      ),
      Layer.succeed(
        JiraMigrationArtifacts,
        JiraMigrationArtifacts.of({
          writeJson: () => Effect.die("unused"),
          readJson: () => Effect.die("unused"),
          verify: () => Effect.die("unused"),
          listPrefix: () => Effect.die("unused"),
          deletePrefix: (_orgSlug, prefix) =>
            Effect.sync(() => {
              removedPrefixes.push(prefix)
            })
        })
      )
    )
    const pg = PgClient.layer({ url: Redacted.make(databaseUrl!) })
    const layer = Layer.mergeAll(
      JiraMigrationProjection.layer.pipe(Layer.provideMerge(DbLive)),
      fakes
    ).pipe(Layer.provideMerge(pg), Layer.orDie)
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        const db = yield* Db
        const created = yield* projection.ensureCreated({
          ...owner,
          requestId: randomUUID(),
          executionId: randomUUID(),
          source: {
            cloudId: "cloud",
            siteName: "Example",
            siteUrl: "https://example.atlassian.net",
            projectId: "10000",
            projectKey: "APP",
            projectName: "Application"
          }
        })
        const projectId = randomUUID()
        const slug = `hidden-${randomUUID()}`
        const fence = {
          migrationId: created.id,
          workflowExecutionId: created.workflowExecutionId!,
          workflowAttempt: created.workflowAttempt
        }
        yield* Effect.promise(() =>
          pool.query(
            "insert into project_index (id,slug,organization_id,key,name,icon,color,created_by,published_at) values ($1,$2,$3,$4,$5,$6,$7,$8,null)",
            [
              projectId,
              slug,
              owner.organizationId,
              "APP",
              "Hidden",
              "📦",
              "#777777",
              owner.userId
            ]
          )
        )
        yield* Effect.promise(() =>
          pool.query(
            "insert into attachment_index (id,organization_id,org_slug,project_slug,object_key,filename,content_type,byte_size,status,uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            [
              "attachment-" + randomUUID(),
              owner.organizationId,
              owner.organizationId,
              slug,
              "copied-object",
              "file.txt",
              "text/plain",
              4,
              "pending",
              owner.userId
            ]
          )
        )
        yield* projection.advance(fence, {
          status: "ready",
          destinationProjectId: projectId,
          destinationProjectSlug: slug
        })
        const ready = yield* projection.owned(owner, created.id)
        const payload = {
          migrationId: created.id,
          mode: "reset_import" as const,
          cleanupGeneration: ready.revision + 1
        }
        const activities = yield* makeJiraCleanupActivities
        expect(yield* activities.claim(payload, "cleanup-execution")).toBe(true)
        yield* activities.deleteCopiedObjects(payload, "cleanup-execution")
        yield* activities.deletePendingAttachments(payload, "cleanup-execution")
        yield* activities.deleteHiddenDocuments(payload, "cleanup-execution")
        yield* activities.deleteHiddenProject(payload, "cleanup-execution")
        yield* activities.complete(payload, "cleanup-execution")
        return {
          migrationId: created.id,
          slug,
          row: yield* projection.owned(owner, created.id),
          remainingProject: yield* db.select().from(projectIndex)
        }
      }).pipe(Effect.provide(layer))
    )
    expect(result.row.destinationProjectId).toBeNull()
    expect(result.row.cleanupExecutionId).toBeNull()
    expect(
      result.remainingProject.some((project) => project.slug === result.slug)
    ).toBe(false)
    expect(removedObjects).toEqual(["copied-object"])
    expect(removedDirectories).toEqual([result.slug])
    expect(removedPrefixes).toEqual([])
  })
})
