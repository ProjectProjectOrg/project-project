import { Db } from "@pp/db"
import { jiraMigration } from "@pp/db/schema"
import { and, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"

import { fenceFor } from "./MigrationProjection"
import type {
  JiraMigrationCleanupCommand,
  JiraMigrationCleanupCommands
} from "./Migrations"

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
  return rows.flatMap((row): ReadonlyArray<JiraMigrationCleanupCommand> => {
    const fence = fenceFor(row)
    return fence === null
      ? []
      : [{ ...fence, expectedRevision: row.revision, mode: "expire" }]
  })
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
  return rows.flatMap((row): ReadonlyArray<JiraMigrationCleanupCommand> => {
    const fence = fenceFor(row)
    return fence === null
      ? []
      : [{ ...fence, expectedRevision: row.revision, mode: "post_success" }]
  })
})

export const runJiraMigrationRetention = (
  cleanup: JiraMigrationCleanupCommands
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

export const JiraMigrationRetentionLive = (
  cleanup: JiraMigrationCleanupCommands
) =>
  Layer.effectDiscard(
    Effect.forkScoped(
      Effect.repeat(
        runJiraMigrationRetention(cleanup).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("Jira migration retention failed", cause)
          )
        ),
        Schedule.spaced("1 hour")
      )
    )
  )
