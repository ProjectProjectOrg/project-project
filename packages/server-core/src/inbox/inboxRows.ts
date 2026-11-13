import { Db } from "@pp/db"
import {
  inboxRow,
  projectMember,
  ticketIndex,
  ticketRelationIndex,
  ticketSubscription,
  type InboxDirect,
  type StagedInbox
} from "@pp/db/schema"
import type { InboxEventEncoded } from "@pp/shared"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

import { deliver, read, resolve, type InboxRowValue } from "./rows"

type Database = Db["Service"]

export const lockTickets = (
  db: Database,
  projectId: string,
  ticketIds: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const keys = [...new Set(ticketIds)].map(
      (ticketId) => `inbox:${projectId}:${ticketId}`
    )
    const hashes = yield* Effect.forEach(keys, (key) =>
      db
        .execute<{ hash: number }>(sql`select hashtext(${key}) as hash`)
        .pipe(Effect.map((result) => Number(result.rows[0]?.hash)))
    )
    for (const hash of [...new Set(hashes)].toSorted((a, b) => a - b))
      yield* db.execute(sql`select pg_advisory_xact_lock(${hash})`)
  })

const loadRows = (db: Database, projectId: string, ticketId: string) =>
  db
    .select()
    .from(inboxRow)
    .where(
      and(eq(inboxRow.projectId, projectId), eq(inboxRow.ticketId, ticketId))
    )
    .pipe(
      Effect.map(
        (rows) =>
          new Map<string, InboxRowValue>(
            rows.map(({ projectId: _p, ticketId: _t, userId, ...value }) => [
              userId,
              value
            ])
          )
      )
    )

const subscribersOf = (db: Database, projectId: string, ticketId: string) =>
  db
    .select({ userId: ticketSubscription.userId })
    .from(ticketSubscription)
    .where(
      and(
        eq(ticketSubscription.projectId, projectId),
        eq(ticketSubscription.ticketId, ticketId),
        eq(ticketSubscription.subscribed, true)
      )
    )
    .pipe(Effect.map((rows) => rows.map((row) => row.userId)))

const membersAmong = (
  db: Database,
  projectId: string,
  userIds: ReadonlyArray<string>
) =>
  userIds.length === 0
    ? Effect.succeed(new Set<string>())
    : db
        .select({ userId: projectMember.userId })
        .from(projectMember)
        .where(
          and(
            eq(projectMember.projectId, projectId),
            inArray(projectMember.userId, [...new Set(userIds)])
          )
        )
        .pipe(Effect.map((rows) => new Set(rows.map((row) => row.userId))))

const upsert = (
  db: Database,
  projectId: string,
  ticketId: string,
  rows: ReadonlyMap<string, InboxRowValue>
) =>
  rows.size === 0
    ? Effect.void
    : db
        .insert(inboxRow)
        .values(
          [...rows].map(([userId, value]) => ({
            projectId,
            ticketId,
            userId,
            ...value
          }))
        )
        .onConflictDoUpdate({
          target: [inboxRow.projectId, inboxRow.ticketId, inboxRow.userId],
          set: {
            state: sql`excluded.state`,
            direct: sql`excluded.direct`,
            latest: sql`excluded.latest`,
            latestAt: sql`excluded.latest_at`,
            actorKind: sql`excluded.actor_kind`,
            actorUserId: sql`excluded.actor_user_id`,
            actorClientId: sql`excluded.actor_client_id`,
            actorClientName: sql`excluded.actor_client_name`,
            actorSource: sql`excluded.actor_source`,
            unreadCount: sql`excluded.unread_count`,
            lastReadAt: sql`excluded.last_read_at`,
            readByClientName: sql`excluded.read_by_client_name`
          }
        })
        .pipe(Effect.asVoid)

const directEntry = (
  event: InboxEventEncoded,
  at: string
): InboxDirect | null =>
  event.kind === "assigned"
    ? { reason: "assigned", at, commentId: null }
    : event.kind === "mentioned"
      ? { reason: "mentioned", at, commentId: event.commentId }
      : null

const isStillBlocked = (
  db: Database,
  projectId: string,
  waitingId: string,
  finishedId: string,
  finished: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const blockers = yield* db
      .select({ ticketId: ticketRelationIndex.toTicketId })
      .from(ticketRelationIndex)
      .where(
        and(
          eq(ticketRelationIndex.projectId, projectId),
          eq(ticketRelationIndex.fromTicketId, waitingId),
          eq(ticketRelationIndex.kind, "blocked_by"),
          ne(ticketRelationIndex.toTicketId, finishedId)
        )
      )
    if (blockers.length === 0) return false
    const states = yield* db
      .select({
        status: ticketIndex.status,
        archivedAt: ticketIndex.archivedAt
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          inArray(
            ticketIndex.ticketId,
            blockers.map((blocker) => blocker.ticketId)
          )
        )
      )
    return states.some(
      (state) => state.archivedAt === null && !finished.includes(state.status)
    )
  })

export const applyInbox = (projectId: string, staged: StagedInbox | null) =>
  Effect.gen(function* () {
    if (staged === null) return
    const db = yield* Db
    const at = DateTime.toDate(DateTime.makeUnsafe(staged.occurredAt))
    const actorUserId = staged.actor.actorUserId ?? null
    const waiting =
      staged.notify && staged.unblockWith !== null
        ? yield* db
            .select({ ticketId: ticketRelationIndex.fromTicketId })
            .from(ticketRelationIndex)
            .where(
              and(
                eq(ticketRelationIndex.projectId, projectId),
                eq(ticketRelationIndex.toTicketId, staged.ticketId),
                eq(ticketRelationIndex.kind, "blocked_by")
              )
            )
        : []
    yield* lockTickets(db, projectId, [
      staged.ticketId,
      ...waiting.map((entry) => entry.ticketId)
    ])
    const rows = yield* loadRows(db, projectId, staged.ticketId)
    const changed = new Map<string, InboxRowValue>()
    const current = (userId: string) =>
      changed.get(userId) ?? rows.get(userId) ?? null

    if (staged.resolve.length > 0)
      for (const [userId, row] of rows) {
        const next = resolve(row, userId, staged.resolve)
        if (next !== row) changed.set(userId, next)
      }

    if (staged.notify) {
      const members = yield* membersAmong(
        db,
        projectId,
        staged.direct.map((entry) => entry.userId)
      )
      const deliveries = new Map<
        string,
        { event: InboxEventEncoded; direct: Array<InboxDirect> }
      >()
      for (const { userId, event } of staged.direct) {
        if (userId === actorUserId || !members.has(userId)) continue
        const entry = directEntry(event, staged.occurredAt)
        const delivery = deliveries.get(userId) ?? { event, direct: [] }
        deliveries.set(userId, {
          event,
          direct: entry === null ? delivery.direct : [...delivery.direct, entry]
        })
      }
      const latest = staged.subscribers.at(-1)
      if (latest !== undefined)
        for (const userId of yield* subscribersOf(
          db,
          projectId,
          staged.ticketId
        )) {
          if (userId === actorUserId || deliveries.has(userId)) continue
          deliveries.set(userId, { event: latest, direct: [] })
        }
      for (const [userId, delivery] of deliveries)
        changed.set(
          userId,
          deliver(current(userId), { ...delivery, at, actor: staged.actor })
        )
    }

    if (staged.readBy && actorUserId !== null) {
      const row = current(actorUserId)
      if (row !== null)
        changed.set(
          actorUserId,
          read(
            row,
            at,
            staged.actor.actorKind === "agent"
              ? (staged.actor.actorClientName ?? null)
              : null
          )
        )
    }

    yield* upsert(db, projectId, staged.ticketId, changed)

    if (!staged.notify || staged.unblockWith === null) return
    const finished = staged.unblockWith
    for (const { ticketId } of waiting) {
      if (
        yield* isStillBlocked(
          db,
          projectId,
          ticketId,
          staged.ticketId,
          finished
        )
      )
        continue
      const waitingRows = yield* loadRows(db, projectId, ticketId)
      const unblocked = new Map<string, InboxRowValue>()
      for (const userId of yield* subscribersOf(db, projectId, ticketId)) {
        if (userId === actorUserId) continue
        unblocked.set(
          userId,
          deliver(waitingRows.get(userId) ?? null, {
            event: { kind: "unblocked", by: staged.ticketId },
            direct: [],
            at,
            actor: staged.actor
          })
        )
      }
      yield* upsert(db, projectId, ticketId, unblocked)
    }
  })

export const removeTicketInbox = (projectId: string, ticketId: string) =>
  Effect.flatMap(Db, (db) =>
    db.transaction(() =>
      lockTickets(db, projectId, [ticketId]).pipe(
        Effect.andThen(
          db
            .delete(inboxRow)
            .where(
              and(
                eq(inboxRow.projectId, projectId),
                eq(inboxRow.ticketId, ticketId)
              )
            )
        )
      )
    )
  )
