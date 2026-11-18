// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import * as GitSyncSchedule from "./GitSyncSchedule"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("GitSyncSchedule", () => {
  const organizationId = `sync-${randomUUID()}`
  const projectIds = [randomUUID(), randomUUID()]
  const linkId = randomUUID()
  let pool: Pool
  let layer: Layer.Layer<GitSyncSchedule.GitSyncSchedule>

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    layer = GitSyncSchedule.layer.pipe(
      Layer.provide(
        DbLive.pipe(
          Layer.provideMerge(
            PgClient.layer({ url: Redacted.make(databaseUrl) })
          )
        )
      ),
      Layer.orDie
    )
    await pool.query(
      "INSERT INTO organization (id, name, slug, created_at) VALUES ($1,$1,$1,now())",
      [organizationId]
    )
    await pool.query(
      "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by) VALUES ($1,'connected',$3,'C','C','folder','blue','test'),($2,'unconnected',$3,'U','U','folder','blue','test')",
      [projectIds[0], projectIds[1], organizationId]
    )
    await pool.query(
      "INSERT INTO organization_integration (id,organization_id,provider,status) VALUES ($1,$2,'github','active')",
      [linkId, organizationId]
    )
    await pool.query(
      "INSERT INTO project_integration_link (id,project_id,organization_id,organization_integration_id,provider,status) VALUES ($1,$2,$3,$1,'github','active')",
      [linkId, projectIds[0], organizationId]
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = $1", [
        organizationId
      ])
      await pool.end()
    }
  })

  it.live(
    "lists connected projects until synced and again once asked for",
    () =>
      Effect.gen(function* () {
        const schedule = yield* GitSyncSchedule.GitSyncSchedule
        const dueIds = Effect.map(schedule.due(100), (projects) =>
          projects.map((project) => project.projectId)
        )
        expect(yield* dueIds).toContain(projectIds[0])
        expect(yield* dueIds).not.toContain(projectIds[1])

        yield* schedule.recordSync(projectIds[0], {
          startedAt: yield* DateTime.nowAsDate,
          status: {
            tokenStatus: "ok",
            repoStatus: "ok",
            refreshStatus: "fresh"
          },
          load: "settled",
          changed: false
        })
        expect(yield* dueIds).not.toContain(projectIds[0])
        expect(yield* schedule.status(projectIds[0])).toEqual({
          tokenStatus: "ok",
          repoStatus: "ok",
          refreshStatus: "fresh"
        })

        yield* schedule.requestSync([projectIds[0]])
        expect(yield* dueIds).toContain(projectIds[0])
      }).pipe(Effect.provide(layer))
  )

  it.live("keeps a project due when asked for during its sync", () =>
    Effect.gen(function* () {
      const schedule = yield* GitSyncSchedule.GitSyncSchedule
      const startedAt = DateTime.toDate(
        DateTime.subtract(yield* DateTime.now, { seconds: 5 })
      )
      yield* schedule.requestSync([projectIds[0]])
      yield* schedule.recordSync(projectIds[0], {
        startedAt,
        status: { tokenStatus: "ok", repoStatus: "ok", refreshStatus: "fresh" },
        load: "settled",
        changed: false
      })
      const due = yield* schedule.due(100)
      expect(due.map((project) => project.projectId)).toContain(projectIds[0])
    }).pipe(Effect.provide(layer))
  )

  it.live("waits for GitHub's rate-limit reset, given in seconds", () =>
    Effect.gen(function* () {
      const schedule = yield* GitSyncSchedule.GitSyncSchedule
      const now = yield* DateTime.now
      const retryAt = Math.floor(DateTime.toEpochMillis(now) / 1000) + 3600
      yield* schedule.recordSync(projectIds[0], {
        startedAt: DateTime.toDate(now),
        status: {
          tokenStatus: "ok",
          repoStatus: "ok",
          refreshStatus: "rate_limited",
          retryAt
        },
        load: "open_pull_requests",
        changed: true
      })
      const [row] = yield* Effect.promise(() =>
        pool.query<{ minutes: number }>(
          "SELECT extract(epoch FROM next_sync_at - now()) / 60 AS minutes FROM github_project_sync WHERE project_id = $1",
          [projectIds[0]]
        )
      ).pipe(Effect.map((result) => result.rows))
      expect(Number(row?.minutes)).toBeGreaterThan(55)
      expect((yield* schedule.status(projectIds[0]))?.retryAt).toBe(retryAt)
    }).pipe(Effect.provide(layer))
  )
})
