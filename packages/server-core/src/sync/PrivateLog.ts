import { Db } from "@pp/db"
import {
  inboxRow,
  privateSyncChange,
  privateSyncScope,
  ticketSubscription
} from "@pp/db/schema"
import type { SyncChangeRef } from "@pp/shared"
import { and, asc, desc, eq, gt, inArray, sql as drizzleSql } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"

import { SyncOperation } from "./ChangeOrigin"
import type { SyncPosition } from "./SyncLog"

export const PRIVATE_RECEIPT_KEY = "private"

export type PrivateTouch = Readonly<{
  userId: string
  projectId: string
  ticketId: string
}>

export const privateFactId = (projectId: string, ticketId: string) =>
  `${projectId}/${ticketId}`

export const touchPrivate = Effect.fnUntraced(function* (
  touches: ReadonlyArray<PrivateTouch>
) {
  if (touches.length === 0) return
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const operationId = yield* SyncOperation
  const byUser = new Map<string, Set<string>>()
  for (const touch of touches) {
    const ids = byUser.get(touch.userId) ?? new Set()
    ids.add(privateFactId(touch.projectId, touch.ticketId))
    byUser.set(touch.userId, ids)
  }
  yield* sql.withTransaction(
    Effect.forEach(
      [...byUser].toSorted(([a], [b]) => a.localeCompare(b)),
      ([userId, ids]) =>
        Effect.gen(function* () {
          const [scope] = yield* db
            .insert(privateSyncScope)
            .values({ userId, head: 1 })
            .onConflictDoUpdate({
              target: privateSyncScope.userId,
              set: { head: drizzleSql`${privateSyncScope.head} + 1` }
            })
            .returning({
              generation: privateSyncScope.generation,
              sequence: privateSyncScope.head
            })
          if (scope === undefined)
            return yield* Effect.die(
              new Error("private sync scope upsert returned no row")
            )
          yield* db.insert(privateSyncChange).values({
            userId,
            generation: scope.generation,
            sequence: scope.sequence,
            operationId,
            tickets: [...ids].toSorted()
          })
        }),
      { discard: true }
    )
  )
}, Effect.orDie)

export const holdersOf = Effect.fnUntraced(function* (
  projectId: string,
  ticketIds: ReadonlyArray<string>
) {
  if (ticketIds.length === 0) return []
  const db = yield* Db
  const ids = [...new Set(ticketIds)]
  const inbox = yield* db
    .select({ userId: inboxRow.userId, ticketId: inboxRow.ticketId })
    .from(inboxRow)
    .where(
      and(eq(inboxRow.projectId, projectId), inArray(inboxRow.ticketId, ids))
    )
  const subscribed = yield* db
    .select({
      userId: ticketSubscription.userId,
      ticketId: ticketSubscription.ticketId
    })
    .from(ticketSubscription)
    .where(
      and(
        eq(ticketSubscription.projectId, projectId),
        inArray(ticketSubscription.ticketId, ids)
      )
    )
  return [...inbox, ...subscribed].map(
    (row): PrivateTouch => ({ ...row, projectId })
  )
}, Effect.orDie)

export const touchHolders = (
  projectId: string,
  ticketIds: ReadonlyArray<string>
) => Effect.flatMap(holdersOf(projectId, ticketIds), touchPrivate)

export const resetPrivate = Effect.fnUntraced(function* (userId: string) {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* db
        .insert(privateSyncScope)
        .values({ userId, generation: 2 })
        .onConflictDoUpdate({
          target: privateSyncScope.userId,
          set: {
            generation: drizzleSql`${privateSyncScope.generation} + 1`,
            head: 0
          }
        })
      yield* db
        .delete(privateSyncChange)
        .where(eq(privateSyncChange.userId, userId))
    })
  )
}, Effect.orDie)

export const fanOutPrivate = (
  projectId: string,
  changes: ReadonlyArray<SyncChangeRef>
) =>
  Effect.gen(function* () {
    yield* touchHolders(
      projectId,
      changes.flatMap((ref) => (ref.kind === "ticket" ? [ref.id] : []))
    )
    for (const ref of changes)
      if (ref.kind === "member" && ref.op === "delete")
        yield* resetPrivate(ref.id)
  })

export const privateHead = Effect.fnUntraced(function* (userId: string) {
  const db = yield* Db
  const rows = yield* db
    .select({
      generation: privateSyncScope.generation,
      sequence: privateSyncScope.head
    })
    .from(privateSyncScope)
    .where(eq(privateSyncScope.userId, userId))
  return rows[0] ?? { generation: 1, sequence: 0 }
}, Effect.orDie)

export const privateEntriesAfter = Effect.fnUntraced(function* (
  userId: string,
  after: SyncPosition,
  head: SyncPosition,
  limit: number
) {
  const db = yield* Db
  return yield* db
    .select({
      sequence: privateSyncChange.sequence,
      tickets: privateSyncChange.tickets
    })
    .from(privateSyncChange)
    .where(
      and(
        eq(privateSyncChange.userId, userId),
        eq(privateSyncChange.generation, head.generation),
        gt(privateSyncChange.sequence, after.sequence),
        drizzleSql`${privateSyncChange.sequence} <= ${head.sequence}`
      )
    )
    .orderBy(asc(privateSyncChange.sequence))
    .limit(limit)
}, Effect.orDie)

export const privatePositionOf = Effect.fnUntraced(function* (
  operationId: string,
  userId: string
) {
  const db = yield* Db
  const [row] = yield* db
    .select({
      generation: privateSyncChange.generation,
      sequence: privateSyncChange.sequence
    })
    .from(privateSyncChange)
    .where(
      and(
        eq(privateSyncChange.operationId, operationId),
        eq(privateSyncChange.userId, userId)
      )
    )
    .orderBy(
      desc(privateSyncChange.generation),
      desc(privateSyncChange.sequence)
    )
    .limit(1)
  return row ?? null
}, Effect.orDie)
