import { Db } from "@pp/db"
import { jiraMigration } from "@pp/db/schema"
import { and, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"

import * as MigrationProjection from "./MigrationProjection"
import type * as Migrations from "./Migrations"
import { JiraMigrationWorkflow } from "./MigrationWorkflow"

export const selectExpiredJiraMigrations = Effect.gen(function* () {
  const db = yield* Db
  const now = yield* DateTime.nowAsDate
  const rows = yield* db
    .select()
    .from(jiraMigration)
    .where(
      and(
        inArray(jiraMigration.status, ["failed", "cancelled"]),
        isNotNull(jiraMigration.retainedUntil),
        lte(jiraMigration.retainedUntil, now),
        isNull(jiraMigration.cleanupExecutionId),
        sql`not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'remoteWritesMayStillCommit')`
      )
    )
    .orderBy(jiraMigration.retainedUntil)
    .limit(100)
  return rows.flatMap(
    (row): ReadonlyArray<Migrations.JiraMigrationCleanupCommand> => {
      const fence = MigrationProjection.fenceFor(row)
      return fence === null
        ? []
        : [{ ...fence, expectedRevision: row.revision, mode: "expire" }]
    }
  )
})

export const selectPendingPostSuccessCleanup = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db
    .select()
    .from(jiraMigration)
    .where(
      and(
        sql`${jiraMigration.status} = 'succeeded'`,
        isNull(jiraMigration.cleanupExecutionId),
        sql`coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'publishedPlan'`,
        sql`not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'postSuccessCleanupCompleted')`,
        sql`not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'remoteWritesMayStillCommit')`
      )
    )
    .orderBy(jiraMigration.finishedAt)
    .limit(100)
  return rows.flatMap(
    (row): ReadonlyArray<Migrations.JiraMigrationCleanupCommand> => {
      const fence = MigrationProjection.fenceFor(row)
      return fence === null
        ? []
        : [{ ...fence, expectedRevision: row.revision, mode: "post_success" }]
    }
  )
})

export const runJiraMigrationRetention = (
  cleanup: Migrations.JiraMigrationCleanupCommands
) =>
  Effect.gen(function* () {
    const expired = yield* selectExpiredJiraMigrations
    const succeeded = yield* selectPendingPostSuccessCleanup
    yield* Effect.forEach(
      [...expired, ...succeeded],
      (command) =>
        cleanup
          .start(command)
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logError("Jira migration retention cleanup failed", cause)
            )
          ),
      { discard: true }
    )
  })

export const STALLED_MIGRATION_AFTER = Duration.minutes(45)

export const selectStalledJiraMigrations = Effect.gen(function* () {
  const db = yield* Db
  const cutoff = DateTime.toDate(
    DateTime.subtractDuration(yield* DateTime.now, STALLED_MIGRATION_AFTER)
  )
  const rows = yield* db
    .select()
    .from(jiraMigration)
    .where(
      and(
        inArray(jiraMigration.status, ["scanning", "migrating", "cancelling"]),
        isNull(jiraMigration.cleanupExecutionId),
        isNotNull(jiraMigration.workflowExecutionId),
        lte(jiraMigration.updatedAt, cutoff)
      )
    )
    .orderBy(jiraMigration.updatedAt)
    .limit(100)
  return rows.flatMap((row) => {
    const fence = MigrationProjection.fenceFor(row)
    return fence === null
      ? []
      : [{ fence, status: row.status, updatedAt: row.updatedAt }]
  })
})

export const runJiraMigrationWatchdog = Effect.gen(function* () {
  const projection = yield* MigrationProjection.JiraMigrationProjection
  const stalled = yield* selectStalledJiraMigrations
  yield* Effect.forEach(
    stalled,
    ({ fence, status, updatedAt }) =>
      Effect.gen(function* () {
        const settled =
          status === "cancelling"
            ? yield* projection.finalizeInterrupted(fence)
            : yield* projection.recordFailure(fence, {
                reason: "jira_migration_stalled",
                detail: `No progress since ${updatedAt.toISOString()}`
              })
        if (!settled) return
        yield* Effect.logWarning("Jira migration stalled; settling it", {
          migrationId: fence.migrationId,
          status
        })
        yield* JiraMigrationWorkflow.interrupt(fence.workflowExecutionId)
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("Jira migration watchdog failed", cause)
        )
      ),
    { discard: true }
  )
})

export const JiraMigrationRetentionLive = (
  cleanup: Migrations.JiraMigrationCleanupCommands
) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* Effect.forkScoped(
        Effect.repeat(
          runJiraMigrationRetention(cleanup).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("Jira migration retention failed", cause)
            )
          ),
          Schedule.spaced("1 hour")
        )
      )
      yield* Effect.forkScoped(
        Effect.repeat(
          runJiraMigrationWatchdog.pipe(
            Effect.catchCause((cause) =>
              Effect.logError("Jira migration watchdog failed", cause)
            )
          ),
          Schedule.spaced("5 minutes")
        )
      )
    })
  )
