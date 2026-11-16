import { Db } from "@pp/db"
import { syncChange, syncScope } from "@pp/db/schema"
import type { SyncChangeRef } from "@pp/shared"
import { and, asc, desc, eq, gt, sql as drizzleSql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import { ChangeOrigin, SyncOperation } from "./ChangeOrigin"

export const SYNC_CHANNEL = "pp_sync"

export type SyncPosition = Readonly<{ generation: number; sequence: number }>

export type SyncEntry = Readonly<{
  projectId: string
  generation: number
  sequence: number
  origin: string | null
  changes: ReadonlyArray<SyncChangeRef>
}>

export class SyncLog extends Context.Service<
  SyncLog,
  Readonly<{
    append: (
      projectId: string,
      changes: ReadonlyArray<SyncChangeRef>
    ) => Effect.Effect<SyncPosition>
    bumpGeneration: (projectId: string) => Effect.Effect<SyncPosition>
    head: (projectId: string) => Effect.Effect<SyncPosition>
    entriesAfter: (
      projectId: string,
      after: SyncPosition,
      limit: number
    ) => Effect.Effect<ReadonlyArray<SyncEntry>>
    positionsOf: (
      operationId: string
    ) => Effect.Effect<ReadonlyMap<string, SyncPosition>>
    withEntry: <A, R>(
      projectId: string,
      changes: ReadonlyArray<SyncChangeRef>,
      write: Effect.Effect<A, never, R>
    ) => Effect.Effect<A, never, R>
  }>
>()("@pp/server-core/sync/SyncLog") {}

export const notificationPayload = (
  projectId: string,
  position: SyncPosition
) => `${projectId}:${position.generation}:${position.sequence}`

export const parseNotification = (
  payload: string
): (SyncPosition & Readonly<{ projectId: string }>) | null => {
  const [projectId, generation, sequence] = payload.split(":")
  const parsed = { generation: Number(generation), sequence: Number(sequence) }
  return projectId !== undefined &&
    Number.isSafeInteger(parsed.generation) &&
    Number.isSafeInteger(parsed.sequence)
    ? { projectId, ...parsed }
    : null
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient

  const notify = (projectId: string, position: SyncPosition) =>
    sql`select pg_notify(${SYNC_CHANNEL}, ${notificationPayload(projectId, position)})`

  const head = Effect.fn("SyncLog.head")(function* (projectId: string) {
    const rows = yield* db
      .select({ generation: syncScope.generation, sequence: syncScope.head })
      .from(syncScope)
      .where(eq(syncScope.projectId, projectId))
    return rows[0] ?? { generation: 1, sequence: 0 }
  }, Effect.orDie)

  const append = Effect.fn("SyncLog.append")(function* (
    projectId: string,
    changes: ReadonlyArray<SyncChangeRef>
  ) {
    if (changes.length === 0) return yield* head(projectId)
    const origin = yield* ChangeOrigin
    const operationId = yield* SyncOperation
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const [scope] = yield* db
          .insert(syncScope)
          .values({ projectId, head: 1 })
          .onConflictDoUpdate({
            target: syncScope.projectId,
            set: { head: drizzleSql`${syncScope.head} + 1` }
          })
          .returning({
            generation: syncScope.generation,
            sequence: syncScope.head
          })
        if (scope === undefined)
          return yield* Effect.die(
            new Error("sync scope upsert returned no row")
          )
        yield* db.insert(syncChange).values({
          projectId,
          generation: scope.generation,
          sequence: scope.sequence,
          operationId,
          origin,
          changes: [...changes]
        })
        yield* notify(projectId, scope)
        return scope
      })
    )
  }, Effect.orDie)

  const bumpGeneration = Effect.fn("SyncLog.bumpGeneration")(function* (
    projectId: string
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const [scope] = yield* db
          .insert(syncScope)
          .values({ projectId, generation: 2 })
          .onConflictDoUpdate({
            target: syncScope.projectId,
            set: {
              generation: drizzleSql`${syncScope.generation} + 1`,
              head: 0,
              oldest: 1
            }
          })
          .returning({
            generation: syncScope.generation,
            sequence: syncScope.head
          })
        if (scope === undefined)
          return yield* Effect.die(
            new Error("sync scope upsert returned no row")
          )
        yield* db.delete(syncChange).where(eq(syncChange.projectId, projectId))
        yield* notify(projectId, scope)
        return scope
      })
    )
  }, Effect.orDie)

  const entriesAfter = Effect.fn("SyncLog.entriesAfter")(function* (
    projectId: string,
    after: SyncPosition,
    limit: number
  ) {
    return yield* db
      .select({
        projectId: syncChange.projectId,
        generation: syncChange.generation,
        sequence: syncChange.sequence,
        origin: syncChange.origin,
        changes: syncChange.changes
      })
      .from(syncChange)
      .where(
        and(
          eq(syncChange.projectId, projectId),
          eq(syncChange.generation, after.generation),
          gt(syncChange.sequence, after.sequence)
        )
      )
      .orderBy(asc(syncChange.sequence))
      .limit(limit)
  }, Effect.orDie)

  const positionsOf = Effect.fn("SyncLog.positionsOf")(function* (
    operationId: string
  ) {
    const rows = yield* db
      .selectDistinctOn([syncChange.projectId], {
        projectId: syncChange.projectId,
        generation: syncChange.generation,
        sequence: syncChange.sequence
      })
      .from(syncChange)
      .where(eq(syncChange.operationId, operationId))
      .orderBy(
        syncChange.projectId,
        desc(syncChange.generation),
        desc(syncChange.sequence)
      )
    return new Map(
      rows.map((row): [string, SyncPosition] => [
        row.projectId,
        { generation: row.generation, sequence: row.sequence }
      ])
    )
  }, Effect.orDie)

  const withEntry = <A, R>(
    projectId: string,
    changes: ReadonlyArray<SyncChangeRef>,
    write: Effect.Effect<A, never, R>
  ): Effect.Effect<A, never, R> =>
    sql
      .withTransaction(Effect.tap(write, () => append(projectId, changes)))
      .pipe(Effect.orDie)

  return SyncLog.of({
    append,
    bumpGeneration,
    head,
    entriesAfter,
    positionsOf,
    withEntry
  })
})

export const layer = Layer.effect(SyncLog, make)
