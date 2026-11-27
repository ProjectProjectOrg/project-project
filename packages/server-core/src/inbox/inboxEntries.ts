import { Db } from "@pp/db"
import {
  inboxEntry,
  projectMember,
  ticketIndex,
  ticketRelationIndex,
  ticketSubscription,
  type StagedInbox,
  type StagedInboxDelivery
} from "@pp/db/schema"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

import { deliver, read, resolve, updatesKey, type EntryValue } from "./entries"

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

const slot = (userId: string, key: string) => `${userId}\u0000${key}`

type Slot = Readonly<{ userId: string; key: string; value: EntryValue }>

const loadEntries = (db: Database, projectId: string, ticketId: string) =>
  db
    .select()
    .from(inboxEntry)
    .where(
      and(
        eq(inboxEntry.projectId, projectId),
        eq(inboxEntry.ticketId, ticketId)
      )
    )
    .pipe(
      Effect.map(
        (rows) =>
          new Map<string, Slot>(
            rows.map(
              ({
                id: _id,
                projectId: _p,
                ticketId: _t,
                createdAt: _c,
                userId,
                key,
                ...value
              }) => [slot(userId, key), { userId, key, value }]
            )
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
  entries: ReadonlyMap<string, Slot>
) =>
  entries.size === 0
    ? Effect.void
    : db
        .insert(inboxEntry)
        .values(
          [...entries.values()].map(({ userId, key, value }) => ({
            projectId,
            ticketId,
            userId,
            key,
            ...value
          }))
        )
        .onConflictDoUpdate({
          target: [
            inboxEntry.projectId,
            inboxEntry.ticketId,
            inboxEntry.userId,
            inboxEntry.key
          ],
          set: {
            kind: sql`excluded.kind`,
            state: sql`excluded.state`,
            clearedBy: sql`excluded.cleared_by`,
            resolvedAt: sql`excluded.resolved_at`,
            revision: sql`excluded.revision`,
            readRevision: sql`excluded.read_revision`,
            eventCount: sql`excluded.event_count`,
            latest: sql`excluded.latest`,
            latestAt: sql`excluded.latest_at`,
            commentId: sql`excluded.comment_id`,
            actorKind: sql`excluded.actor_kind`,
            actorUserId: sql`excluded.actor_user_id`,
            actorClientId: sql`excluded.actor_client_id`,
            actorClientName: sql`excluded.actor_client_name`,
            actorSource: sql`excluded.actor_source`,
            readByClientName: sql`excluded.read_by_client_name`
          }
        })
        .pipe(Effect.asVoid)

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

const deliverTo = (
  entries: ReadonlyMap<string, Slot>,
  changed: Map<string, Slot>,
  userId: string,
  delivery: Omit<StagedInboxDelivery, "userId">,
  at: Date,
  actor: StagedInbox["actor"]
) => {
  const id = slot(userId, delivery.key)
  const current = changed.get(id) ?? entries.get(id) ?? null
  changed.set(id, {
    userId,
    key: delivery.key,
    value: deliver(current?.value ?? null, { ...delivery, at, actor })
  })
}

export const applyInbox = (projectId: string, staged: StagedInbox | null) =>
  Effect.gen(function* () {
    if (staged === null || staged.version !== 2) return
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
    const entries = yield* loadEntries(db, projectId, staged.ticketId)
    const changed = new Map<string, Slot>()

    if (staged.resolve.length > 0)
      for (const [id, { userId, key, value }] of entries) {
        const next = resolve(value, key, userId, staged.resolve, at)
        if (next !== value) changed.set(id, { userId, key, value: next })
      }

    if (staged.notify) {
      const members = yield* membersAmong(
        db,
        projectId,
        staged.direct.map((entry) => entry.userId)
      )
      const reached = new Set<string>()
      for (const { userId, ...delivery } of staged.direct) {
        if (userId === actorUserId || !members.has(userId)) continue
        reached.add(userId)
        deliverTo(entries, changed, userId, delivery, at, staged.actor)
      }
      if (staged.subscribers.length > 0)
        for (const userId of yield* subscribersOf(
          db,
          projectId,
          staged.ticketId
        )) {
          if (userId === actorUserId || reached.has(userId)) continue
          for (const event of staged.subscribers)
            deliverTo(
              entries,
              changed,
              userId,
              {
                key: updatesKey,
                event,
                commentId: event.kind === "commented" ? event.commentId : null
              },
              at,
              staged.actor
            )
        }
    }

    if (staged.readBy && actorUserId !== null) {
      const id = slot(actorUserId, updatesKey)
      const current = changed.get(id) ?? entries.get(id)
      if (
        current !== undefined &&
        current.value.latestAt.getTime() <= at.getTime()
      )
        changed.set(id, {
          ...current,
          value: read(
            current.value,
            current.value.revision,
            staged.actor.actorKind === "agent"
              ? (staged.actor.actorClientName ?? null)
              : null
          )
        })
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
      const waitingEntries = yield* loadEntries(db, projectId, ticketId)
      const unblocked = new Map<string, Slot>()
      for (const userId of yield* subscribersOf(db, projectId, ticketId)) {
        if (userId === actorUserId) continue
        deliverTo(
          waitingEntries,
          unblocked,
          userId,
          {
            key: updatesKey,
            event: { kind: "unblocked", by: staged.ticketId },
            commentId: null
          },
          at,
          staged.actor
        )
      }
      yield* upsert(db, projectId, ticketId, unblocked)
    }
  })

export const removeTicketInbox = (projectId: string, ticketId: string) =>
  Effect.flatMap(Db, (db) =>
    db
      .delete(inboxEntry)
      .where(
        and(
          eq(inboxEntry.projectId, projectId),
          eq(inboxEntry.ticketId, ticketId)
        )
      )
  )
