import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { DbLive, pgTypes } from "@pp/db"
import { JiraClient } from "@pp/server-core/jira/Client"
import { JiraMigrationProjection } from "@pp/server-core/jira/MigrationProjection"
import { JiraMigrationWorkflow } from "@pp/server-core/jira/MigrationWorkflow"
import {
  makeScanTestLayer,
  response,
  scanFixtureResponse
} from "@pp/server-core/jira/ScanTestSupport"
import { MarkdownLive } from "@pp/server-core/markdown/MarkdownLive"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { S3Storage } from "@pp/server-core/storage/S3Storage"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { ConfigProvider, Effect, Layer, Redacted, Schedule } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { JiraWorkflowsLive } from "./WorkflowRuntime"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("Jira SQL workflow restart", () => {
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
      migrationsFolder: `${import.meta.dirname}/../../../../packages/db/src/migrations`
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

  it.each(["interrupted request", "rate limit sleep"] as const)(
    "keeps completed scan pages across %s and configuration restarts",
    async (pause) => {
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
      let blockIssue = true
      const fixture = makeScanTestLayer((request) =>
        request.url.includes("/search/jql") && blockIssue
          ? pause === "interrupted request"
            ? Effect.never
            : Effect.succeed(response({}, 429, { "retry-after": "15" }))
          : Effect.succeed(scanFixtureResponse(request))
      )
      const objects = new Map<string, Uint8Array>()
      const connection = {
        endpoint: "https://test.invalid",
        bucket: "test",
        region: "auto",
        keyPrefix: null,
        forcePathStyle: true,
        accessKeyId: "test",
        secretAccessKey: "test"
      }
      const clientOnly = Layer.effect(JiraClient, JiraClient).pipe(
        Layer.provide(fixture.layer)
      )
      const storage = Layer.mergeAll(
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
            putObject: (_, key, _type, bytes) =>
              Effect.sync(() => {
                objects.set(key, bytes)
              }),
            getObject: (_, key) => Effect.sync(() => objects.get(key) ?? null),
            listObjectKeys: (_, prefix) =>
              Effect.sync(() =>
                [...objects.keys()].filter((key) => key.startsWith(prefix))
              ),
            deleteObject: (_, key) =>
              Effect.sync(() => {
                objects.delete(key)
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
            writeTemplateDefaults: () => Effect.die("unused"),
            removeDir: () => Effect.die("unused")
          })
        )
      )
      const pg = PgClient.layer({
        url: Redacted.make(databaseUrl!),
        types: pgTypes
      })
      const layer = JiraWorkflowsLive.pipe(
        Layer.provideMerge(DbLive),
        Layer.provideMerge(clientOnly),
        Layer.provideMerge(storage),
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
        Layer.provideMerge(pg),
        Layer.orDie
      )
      const payload = {
        command: {
          _tag: "Create" as const,
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
      }
      const migrationId = await Effect.runPromise(
        Effect.gen(function* () {
          const id = yield* JiraMigrationWorkflow.execute(payload, {
            discard: true
          })
          yield* Effect.sync(() =>
            fixture.requests.some((request) =>
              request.url.includes("/search/jql")
            )
          ).pipe(
            Effect.repeat({
              until: (seen) => seen,
              schedule: Schedule.spaced("10 millis")
            }),
            Effect.timeout("10 seconds")
          )
          return id
        }).pipe(Effect.provide(layer))
      )
      blockIssue = false
      await Effect.runPromise(
        Effect.gen(function* () {
          const projection = yield* JiraMigrationProjection
          const row = yield* projection.owned(owner, migrationId).pipe(
            Effect.repeat({
              while: (current) => current.status === "scanning",
              schedule: Schedule.spaced("10 millis")
            }),
            Effect.timeout("10 seconds")
          )
          expect(row.status).toBe("needs_configuration")
        }).pipe(Effect.provide(layer))
      )
      const callsBeforeRestart = fixture.requests.length
      expect(callsBeforeRestart).toBeGreaterThan(0)
      expect(
        fixture.requests.filter((request) =>
          new URL(request.url).pathname.endsWith("/project/10000")
        )
      ).toHaveLength(1)
      expect(
        fixture.requests.filter((request) =>
          request.url.includes("/search/jql")
        )
      ).toHaveLength(2)
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* JiraMigrationWorkflow.resume(migrationId)
          const projection = yield* JiraMigrationProjection
          const row = yield* projection.owned(owner, migrationId)
          expect(row.status).toBe("needs_configuration")
        }).pipe(Effect.provide(layer))
      )
      expect(fixture.requests).toHaveLength(callsBeforeRestart)
    },
    70_000
  )
})
