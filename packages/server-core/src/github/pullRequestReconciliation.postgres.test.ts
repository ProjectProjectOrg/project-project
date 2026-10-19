import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { Db, DbLive } from "@pp/db"
import { githubPullRequestReconciliation } from "@pp/db/schema"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { describe, expect } from "vitest"

import {
  mergedPullRequestsForRepository,
  rememberPullRequest
} from "./pullRequestReconciliation"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const databaseLayer = DbLive.pipe(
  Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl ?? "") })),
  Layer.orDie
)

describe.skipIf(!databaseUrl)("pull request reconciliation", () => {
  it.effect(
    "orders each PR independently and keeps merged history when a replacement opens",
    () =>
      Effect.gen(function* () {
        const url = new URL(databaseUrl ?? "")
        if (
          !["127.0.0.1", "localhost"].includes(url.hostname) ||
          !url.pathname.startsWith("/projectproject_effect_v4_")
        ) {
          throw new Error("Test requires an isolated local database")
        }
        const db = yield* Db
        const repositoryId = randomUUID()
        yield* Effect.addFinalizer(() =>
          db
            .delete(githubPullRequestReconciliation)
            .where(
              eq(githubPullRequestReconciliation.repositoryId, repositoryId)
            )
            .pipe(Effect.orDie)
        )
        const mergedAt = DateTime.toDate(
          DateTime.makeUnsafe("2026-10-19T10:00:00Z")
        )
        const merged = {
          repositoryId,
          number: 80,
          branch: "release",
          baseBranch: "main",
          state: "merged" as const,
          updatedAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-10-19T11:00:00Z")
          ),
          mergedAt
        }
        expect(yield* rememberPullRequest(db, merged)).toBe(true)
        expect(
          yield* rememberPullRequest(db, {
            ...merged,
            number: 81,
            state: "open",
            updatedAt: DateTime.toDate(
              DateTime.makeUnsafe("2026-10-19T09:00:00Z")
            ),
            mergedAt: null
          })
        ).toBe(true)
        expect(
          yield* rememberPullRequest(db, {
            ...merged,
            updatedAt: DateTime.toDate(
              DateTime.makeUnsafe("2026-10-19T10:30:00Z")
            ),
            state: "closed",
            mergedAt: null
          })
        ).toBe(false)
        expect(yield* rememberPullRequest(db, merged)).toBe(true)
        expect(
          yield* mergedPullRequestsForRepository(db, repositoryId)
        ).toEqual([
          {
            repositoryId,
            number: 80,
            branch: "release",
            base: "main",
            state: "merged",
            updatedAt: merged.updatedAt,
            mergedAt
          }
        ])
      }).pipe(Effect.scoped, Effect.provide(databaseLayer))
  )
})
