// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { isoDate } from "../tickets/testing"
import * as PullRequestSnapshots from "./PullRequestSnapshots"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("PullRequestSnapshots", () => {
  const repositoryId = `repo-${randomUUID()}`
  let pool: Pool
  let layer: Layer.Layer<PullRequestSnapshots.PullRequestSnapshots>

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
    layer = PullRequestSnapshots.layer.pipe(
      Layer.provide(
        DbLive.pipe(
          Layer.provideMerge(
            PgClient.layer({ url: Redacted.make(databaseUrl) })
          )
        )
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    await pool?.query(
      "DELETE FROM github_pull_request WHERE repository_id = $1",
      [repositoryId]
    )
    await pool?.end()
  })

  const snapshot = (
    overrides: Partial<PullRequestSnapshots.PullRequestSnapshot>
  ) =>
    ({
      repositoryId,
      number: 42,
      branch: "feat/T-1",
      base: "main",
      state: "open",
      draft: false,
      title: "Add search",
      mergedAt: null,
      checks: "passing",
      observedAt: isoDate("2026-04-01T00:00:10Z"),
      ...overrides
    }) satisfies PullRequestSnapshots.PullRequestSnapshot

  it.effect(
    "keeps the newest observation and the details an update leaves out",
    () =>
      Effect.gen(function* () {
        const snapshots = yield* PullRequestSnapshots.PullRequestSnapshots
        yield* snapshots.record([snapshot({})])
        yield* snapshots.record([
          snapshot({
            state: "merged",
            title: "Add search (final)",
            mergedAt: isoDate("2026-04-01T00:00:20Z"),
            checks: null,
            observedAt: isoDate("2026-04-01T00:00:20Z")
          })
        ])
        yield* snapshots.record([
          snapshot({ observedAt: isoDate("2026-04-01T00:00:15Z") })
        ])
        const [stored] = yield* snapshots.find([
          { repositoryId, numbers: [42] }
        ])
        expect(stored).toMatchObject({
          state: "merged",
          title: "Add search (final)",
          checks: "passing",
          mergedAt: isoDate("2026-04-01T00:00:20Z")
        })
      }).pipe(Effect.provide(layer))
  )
})
