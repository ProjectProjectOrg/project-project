import {
  type InboxItem,
  PrivateFact,
  type PrivateChanges,
  type PrivateSnapshotPage,
  type SyncCursor
} from "@pp/shared"
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
  gte,
  sql
} from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { LocalDb } from "./LocalDb"
import type { Applied } from "./store"
import { syncOf } from "./store"
import { localCopies, localInbox, localStaging, localSync } from "./tables"

export const INBOX_SCOPE = "private"

const CHUNK = 500

const encodeFact = Schema.encodeSync(Schema.fromJsonString(PrivateFact))
const decodeFact = Schema.decodeSync(Schema.fromJsonString(PrivateFact))

export const inboxKey = (projectSlug: string, ticketId: string) =>
  `${projectSlug}/${ticketId}`

const inboxRow = (copy: number, fact: PrivateFact) => {
  const inbox = fact.inbox
  return {
    copy,
    id: fact.id,
    org: fact.orgSlug,
    key: inboxKey(fact.projectSlug, fact.ticketId),
    state:
      inbox === null
        ? null
        : inbox.done
          ? "done"
          : inbox.item.unread
            ? "unread"
            : "read",
    direct: inbox !== null && inbox.item.direct.length > 0 ? 1 : 0,
    latestAt: inbox?.item.latestAt.toISOString() ?? null,
    lastReadAt: inbox?.item.lastReadAt?.toISOString() ?? null,
    data: encodeFact(fact)
  } satisfies typeof localInbox.$inferInsert
}

const writeFacts = (copy: number, facts: ReadonlyArray<PrivateFact>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    for (const chunk of Arr.chunksOf(facts, CHUNK))
      yield* db
        .insert(localInbox)
        .values(chunk.map((fact) => inboxRow(copy, fact)))
        .onConflictDoUpdate({
          target: [localInbox.copy, localInbox.id],
          set: {
            org: sql.raw("excluded.org"),
            key: sql.raw("excluded.key"),
            state: sql.raw("excluded.state"),
            direct: sql.raw("excluded.direct"),
            latestAt: sql.raw("excluded.latest_at"),
            lastReadAt: sql.raw("excluded.last_read_at"),
            data: sql.raw("excluded.data")
          }
        })
  })

const removeFacts = (copy: number, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    for (const chunk of Arr.chunksOf(ids, CHUNK))
      yield* db
        .delete(localInbox)
        .where(and(eq(localInbox.copy, copy), inArray(localInbox.id, chunk)))
  })

const stagingRow = Effect.gen(function* () {
  const db = yield* LocalDb
  const [row] = yield* db
    .select()
    .from(localStaging)
    .where(eq(localStaging.scope, INBOX_SCOPE))
  return row ?? null
})

export const beginInbox = (page: PrivateSnapshotPage) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const previous = yield* stagingRow
        const [created] = yield* db
          .insert(localCopies)
          .values({ scope: INBOX_SCOPE })
          .returning({ id: localCopies.id })
        if (created === undefined)
          return yield* Effect.die(new Error("no copy id returned"))
        yield* writeFacts(created.id, page.facts)
        const row = {
          scope: INBOX_SCOPE,
          copy: created.id,
          base: page.base,
          next: page.next,
          git: 0
        }
        yield* db
          .insert(localStaging)
          .values(row)
          .onConflictDoUpdate({ target: localStaging.scope, set: row })
        return previous?.copy ?? null
      })
    )
  })

export const applyInboxPage = (requested: string, page: PrivateSnapshotPage) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const staging = yield* stagingRow
        if (staging === null || staging.next !== requested)
          return "stale" satisfies Applied
        yield* writeFacts(staging.copy, page.facts)
        yield* db
          .update(localStaging)
          .set({ next: page.next })
          .where(eq(localStaging.scope, INBOX_SCOPE))
        return "applied" satisfies Applied
      })
    )
  })

export const applyInboxChanges = (base: SyncCursor, changes: PrivateChanges) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const current = yield* syncOf(INBOX_SCOPE)
        if (current === null || current.cursor !== base)
          return "stale" satisfies Applied
        yield* removeFacts(current.copy, changes.deletes)
        yield* writeFacts(current.copy, changes.upserts)
        yield* db
          .update(localSync)
          .set({ cursor: changes.cursor })
          .where(eq(localSync.scope, INBOX_SCOPE))
        return "applied" satisfies Applied
      })
    )
  })

export const dropInboxCopy = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* db.delete(localInbox).where(eq(localInbox.copy, copy))
        yield* db.delete(localCopies).where(eq(localCopies.id, copy))
      })
    )
  })

export type LocalInboxRow = Readonly<{
  key: string
  done: boolean
  item: InboxItem
}>

const rowsOf = (rows: ReadonlyArray<Readonly<{ data: string }>>) =>
  rows.flatMap((row): ReadonlyArray<LocalInboxRow> => {
    const fact = decodeFact(row.data)
    return fact.inbox === null
      ? []
      : [
          {
            key: inboxKey(fact.projectSlug, fact.ticketId),
            done: fact.inbox.done,
            item: fact.inbox.item
          }
        ]
  })

export type InboxCandidates = Readonly<{
  copy: number
  orgSlug: string
  keys: ReadonlyArray<string>
}>

const pendingKeys = (request: InboxCandidates) =>
  request.keys.length === 0
    ? undefined
    : inArray(localInbox.key, [...request.keys])

export const listedCandidates = (
  request: InboxCandidates & Readonly<{ readSince: string; limit: number }>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({ data: localInbox.data })
      .from(localInbox)
      .where(
        and(
          eq(localInbox.copy, request.copy),
          eq(localInbox.org, request.orgSlug),
          isNotNull(localInbox.state),
          or(
            and(
              ne(localInbox.state, "done"),
              or(
                eq(localInbox.state, "unread"),
                eq(localInbox.direct, 1),
                gte(localInbox.lastReadAt, request.readSince)
              )
            ),
            pendingKeys(request)
          )
        )
      )
      .orderBy(desc(localInbox.latestAt), desc(localInbox.id))
      .limit(request.limit + request.keys.length)
    return rowsOf(rows)
  })

export const unreadCandidates = (request: InboxCandidates) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({ data: localInbox.data })
      .from(localInbox)
      .where(
        and(
          eq(localInbox.copy, request.copy),
          eq(localInbox.org, request.orgSlug),
          or(eq(localInbox.state, "unread"), pendingKeys(request))
        )
      )
    return rowsOf(rows)
  })
