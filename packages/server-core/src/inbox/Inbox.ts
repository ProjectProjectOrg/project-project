import { Db } from "@pp/db"
import { inboxEntry, projectIndex } from "@pp/db/schema"
import {
  NotFound,
  OrgScope,
  ProjectScope,
  type InboxClearedBy,
  type InboxEntryState
} from "@pp/shared"
import { and, eq, inArray, lte, ne, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { markUnread, read, remove, type EntryValue } from "./entries"
import { lockTickets } from "./inboxEntries"

export type EntryState = Readonly<{
  id: string
  state: InboxEntryState
  clearedBy: InboxClearedBy | null
  revision: number
}>

export class Inbox extends Context.Service<
  Inbox,
  Readonly<{
    markTicketRead: (
      ticketId: string
    ) => Effect.Effect<void, never, ProjectScope>
    markRead: (
      entryId: string,
      revision: number
    ) => Effect.Effect<EntryState, NotFound, OrgScope>
    markUnread: (
      entryId: string
    ) => Effect.Effect<EntryState, NotFound, OrgScope>
    remove: (
      entryId: string,
      revision: number
    ) => Effect.Effect<EntryState, NotFound, OrgScope>
    markAllRead: (upTo: Date) => Effect.Effect<number, never, OrgScope>
  }>
>()("@pp/server-core/inbox/Inbox") {}

const stateOf = (id: string, value: EntryValue) =>
  ({
    id,
    state: value.state,
    clearedBy: value.clearedBy,
    revision: value.revision
  }) satisfies EntryState

const valueOf = ({
  id: _id,
  projectId: _p,
  ticketId: _t,
  userId: _u,
  key: _k,
  createdAt: _c,
  ...value
}: typeof inboxEntry.$inferSelect) => value satisfies EntryValue

const changes = (value: EntryValue) => ({
  state: value.state,
  clearedBy: value.clearedBy,
  readRevision: value.readRevision,
  eventCount: value.eventCount,
  readByClientName: value.readByClientName
})

const make = Effect.gen(function* () {
  const db = yield* Db

  const ownedEntry = (entryId: string) =>
    Effect.gen(function* () {
      const scope = yield* OrgScope
      const rows = yield* db
        .select({ entry: inboxEntry })
        .from(inboxEntry)
        .innerJoin(projectIndex, eq(projectIndex.id, inboxEntry.projectId))
        .where(
          and(
            eq(inboxEntry.id, entryId),
            eq(inboxEntry.userId, scope.userId),
            eq(projectIndex.organizationId, scope.organizationId)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      const found = rows[0]?.entry
      if (found === undefined) return yield* new NotFound()
      return found
    })

  const change = (entryId: string, apply: (value: EntryValue) => EntryValue) =>
    db
      .transaction(() =>
        Effect.gen(function* () {
          let found = yield* ownedEntry(entryId)
          let fresh = found
          do {
            found = fresh
            yield* lockTickets(db, found.projectId, [found.ticketId])
            fresh = yield* ownedEntry(entryId)
          } while (
            fresh.projectId !== found.projectId ||
            fresh.ticketId !== found.ticketId
          )
          const before = valueOf(fresh)
          const after = apply(before)
          if (after !== before)
            yield* db
              .update(inboxEntry)
              .set(changes(after))
              .where(eq(inboxEntry.id, entryId))
          return stateOf(entryId, after)
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )

  const markTicketRead = Effect.fn("Inbox.markTicketRead")(function* (
    ticketId: string
  ) {
    const scope = yield* ProjectScope
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* lockTickets(db, scope.projectId, [ticketId])
          const rows = yield* db
            .select()
            .from(inboxEntry)
            .where(
              and(
                eq(inboxEntry.projectId, scope.projectId),
                eq(inboxEntry.ticketId, ticketId),
                eq(inboxEntry.userId, scope.userId),
                ne(inboxEntry.state, "cleared")
              )
            )
          for (const row of rows) {
            const before = valueOf(row)
            const after = read(before, before.revision, null)
            if (after !== before)
              yield* db
                .update(inboxEntry)
                .set(changes(after))
                .where(eq(inboxEntry.id, row.id))
          }
        })
      )
      .pipe(Effect.orDie)
  })

  const markRead = Effect.fn("Inbox.markRead")(function* (
    entryId: string,
    revision: number
  ) {
    return yield* change(entryId, (value) => read(value, revision, null))
  })

  const markUnreadEntry = Effect.fn("Inbox.markUnread")(function* (
    entryId: string
  ) {
    return yield* change(entryId, markUnread)
  })

  const removeEntry = Effect.fn("Inbox.remove")(function* (
    entryId: string,
    revision: number
  ) {
    return yield* change(entryId, (value) => remove(value, revision))
  })

  const markAllRead = Effect.fn("Inbox.markAllRead")(function* (upTo: Date) {
    const scope = yield* OrgScope
    const projects = db
      .select({ id: projectIndex.id })
      .from(projectIndex)
      .where(eq(projectIndex.organizationId, scope.organizationId))
    const unreadUpTo = and(
      eq(inboxEntry.userId, scope.userId),
      eq(inboxEntry.state, "unread"),
      lte(inboxEntry.latestAt, upTo),
      inArray(inboxEntry.projectId, projects)
    )
    return yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const targets = yield* db
            .select({
              id: inboxEntry.id,
              projectId: inboxEntry.projectId,
              ticketId: inboxEntry.ticketId
            })
            .from(inboxEntry)
            .where(unreadUpTo)
          if (targets.length === 0) return 0
          const byProject = new Map<string, Array<string>>()
          for (const { projectId, ticketId } of targets)
            byProject.set(projectId, [
              ...(byProject.get(projectId) ?? []),
              ticketId
            ])
          for (const projectId of [...byProject.keys()].toSorted())
            yield* lockTickets(db, projectId, byProject.get(projectId) ?? [])
          const updated = yield* db
            .update(inboxEntry)
            .set({
              state: sql`case when ${inboxEntry.kind} = 'mentioned' then 'read' else 'cleared' end`,
              clearedBy: sql`case when ${inboxEntry.kind} = 'mentioned' then null else 'read' end`,
              readRevision: sql`${inboxEntry.revision}`,
              eventCount: 0,
              readByClientName: null
            })
            .where(
              and(
                unreadUpTo,
                inArray(
                  inboxEntry.id,
                  targets.map((target) => target.id)
                )
              )
            )
            .returning({ id: inboxEntry.id })
          return updated.length
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
  })

  return Inbox.of({
    markTicketRead,
    markRead,
    markUnread: markUnreadEntry,
    remove: removeEntry,
    markAllRead
  })
})

export const layer = Layer.effect(Inbox, make)
