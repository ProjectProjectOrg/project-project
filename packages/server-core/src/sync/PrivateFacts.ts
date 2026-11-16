import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  inboxRow,
  organization,
  projectIndex,
  ticketIndex,
  ticketSubscription
} from "@pp/db/schema"
import {
  CurrentUser,
  Forbidden,
  type PrivateChanges,
  type PrivateFact,
  type PrivateSnapshotPage,
  type PrivateSync,
  type ProjectSyncQuery,
  TicketId
} from "@pp/shared"
import { and, eq, inArray, isNull, or, sql as drizzleSql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { inboxItems } from "../inbox/inboxItems"
import * as Users from "../users/Users"
import { privateEntriesAfter, privateFactId, privateHead } from "./PrivateLog"
import {
  decodeSyncCursor,
  encodeSyncCursor,
  SyncPageLimits
} from "./ProjectFacts"
import type { SyncPosition } from "./SyncLog"

const Key = Schema.Struct({ projectId: Schema.String, ticketId: Schema.String })
type Key = typeof Key.Type

const PageToken = Schema.Struct({
  generation: Schema.Finite,
  sequence: Schema.Finite,
  after: Key
})
const encodeToken = Schema.encodeSync(Schema.fromJsonString(PageToken))
const decodeToken = Schema.decodeUnknownOption(Schema.fromJsonString(PageToken))
const decodeTicketId = Schema.decodeUnknownSync(TicketId)

const keyOf = (id: string): Key | null => {
  const slash = id.indexOf("/")
  return slash < 0
    ? null
    : { projectId: id.slice(0, slash), ticketId: id.slice(slash + 1) }
}

const keysWhere = (
  keys: ReadonlyArray<Key>,
  projectColumn: PgColumn,
  ticketColumn: PgColumn
) =>
  or(
    ...Object.entries(Arr.groupBy(keys, (key) => key.projectId)).map(
      ([projectId, group]) =>
        and(
          eq(projectColumn, projectId),
          inArray(
            ticketColumn,
            group.map((key) => key.ticketId)
          )
        )
    )
  )

export class PrivateFacts extends Context.Service<
  PrivateFacts,
  Readonly<{
    pull: (
      owner: string,
      query: ProjectSyncQuery
    ) => Effect.Effect<PrivateSync, Forbidden, CurrentUser>
  }>
>()("@pp/server-core/sync/PrivateFacts") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const users = yield* Users.Users

  const keysAfter = (userId: string, after: Key | null, limit: number) =>
    db
      .execute<{ project_id: string; ticket_id: string }>(
        drizzleSql`select project_id::text as project_id, ticket_id from (
          select project_id, ticket_id from ${inboxRow} where user_id = ${userId}
          union
          select project_id, ticket_id from ${ticketSubscription} where user_id = ${userId}
        ) as keys
        ${after === null ? drizzleSql`` : drizzleSql`where (project_id, ticket_id) > (${after.projectId}::uuid, ${after.ticketId})`}
        order by project_id, ticket_id
        limit ${limit}`
      )
      .pipe(
        Effect.map((result) =>
          result.rows.map(
            (row): Key => ({
              projectId: row.project_id,
              ticketId: row.ticket_id
            })
          )
        )
      )

  const visible = and(publishedProject(), isNull(organization.deletedAt))

  const factsFor = Effect.fnUntraced(function* (
    userId: string,
    keys: ReadonlyArray<Key>
  ) {
    if (keys.length === 0) return []
    const inbox = yield* db
      .select({
        row: inboxRow,
        orgSlug: organization.slug,
        projectSlug: projectIndex.slug,
        title: ticketIndex.title,
        status: ticketIndex.status,
        archivedAt: ticketIndex.archivedAt
      })
      .from(inboxRow)
      .innerJoin(projectIndex, eq(projectIndex.id, inboxRow.projectId))
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .innerJoin(
        ticketIndex,
        and(
          eq(ticketIndex.projectId, inboxRow.projectId),
          eq(ticketIndex.ticketId, inboxRow.ticketId)
        )
      )
      .where(
        and(
          eq(inboxRow.userId, userId),
          visible,
          keysWhere(keys, inboxRow.projectId, inboxRow.ticketId)
        )
      )
    const subscriptions = yield* db
      .select({
        projectId: ticketSubscription.projectId,
        ticketId: ticketSubscription.ticketId,
        subscribed: ticketSubscription.subscribed,
        orgSlug: organization.slug,
        projectSlug: projectIndex.slug
      })
      .from(ticketSubscription)
      .innerJoin(
        projectIndex,
        eq(projectIndex.id, ticketSubscription.projectId)
      )
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(ticketSubscription.userId, userId),
          visible,
          keysWhere(
            keys,
            ticketSubscription.projectId,
            ticketSubscription.ticketId
          )
        )
      )
    const items = yield* inboxItems(inbox).pipe(
      Effect.provideService(Users.Users, users)
    )
    const facts = new Map<string, PrivateFact>()
    for (const sub of subscriptions) {
      const id = privateFactId(sub.projectId, sub.ticketId)
      facts.set(id, {
        id,
        orgSlug: sub.orgSlug,
        projectSlug: sub.projectSlug,
        ticketId: decodeTicketId(sub.ticketId),
        subscribed: sub.subscribed,
        inbox: null
      })
    }
    inbox.forEach(({ row, orgSlug }, index) => {
      const item = items[index]
      if (item === undefined) return
      const id = privateFactId(row.projectId, row.ticketId)
      facts.set(id, {
        id,
        orgSlug,
        projectSlug: item.projectSlug,
        ticketId: item.ticket.id,
        subscribed: facts.get(id)?.subscribed ?? null,
        inbox: { done: row.state === "done", item }
      })
    })
    return [...facts.values()].toSorted((a, b) => a.id.localeCompare(b.id))
  })

  const page = Effect.fnUntraced(function* (
    userId: string,
    head: SyncPosition,
    after: Key | null
  ) {
    const limits = yield* SyncPageLimits
    const keys = yield* keysAfter(userId, after, limits.tickets)
    const last = keys.at(-1)
    return {
      kind: "snapshot",
      base: encodeSyncCursor(head),
      first: after === null,
      facts: yield* factsFor(userId, keys),
      next:
        keys.length < limits.tickets || last === undefined
          ? null
          : encodeToken({ ...head, after: last })
    } satisfies PrivateSnapshotPage
  })

  const catchUp = Effect.fnUntraced(function* (
    userId: string,
    from: SyncPosition,
    head: SyncPosition
  ) {
    const limits = yield* SyncPageLimits
    const entries = yield* privateEntriesAfter(
      userId,
      from,
      head,
      limits.entries
    )
    const ids = new Set<string>()
    let covered = from.sequence
    for (const entry of entries) {
      if (ids.size >= limits.facts) break
      for (const id of entry.tickets) ids.add(id)
      covered = entry.sequence
    }
    const keys = [...ids].flatMap((id) => {
      const key = keyOf(id)
      return key === null ? [] : [key]
    })
    const upserts = yield* factsFor(userId, keys)
    const present = new Set(upserts.map((fact) => fact.id))
    return {
      kind: "changes",
      cursor: encodeSyncCursor({
        generation: head.generation,
        sequence: covered
      }),
      upserts,
      deletes: [...ids].filter((id) => !present.has(id)),
      more: covered < head.sequence
    } satisfies PrivateChanges
  })

  const pull = Effect.fn("PrivateFacts.pull")(function* (
    owner: string,
    query: ProjectSyncQuery
  ) {
    const user = yield* CurrentUser
    if (user.id !== owner) return yield* new Forbidden()
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`set transaction isolation level repeatable read, read only`
          const head = yield* privateHead(owner)
          if (query.page !== undefined) {
            const token = Option.getOrNull(decodeToken(query.page))
            return token !== null &&
              token.generation === head.generation &&
              token.sequence <= head.sequence
              ? yield* page(owner, token, token.after)
              : yield* page(owner, head, null)
          }
          const from =
            query.after === undefined ? null : decodeSyncCursor(query.after)
          if (
            from === null ||
            from.generation !== head.generation ||
            from.sequence > head.sequence
          )
            return yield* page(owner, head, null)
          return yield* catchUp(owner, from, head)
        }).pipe(Effect.provideService(Db, db))
      )
      .pipe(Effect.orDie)
  })

  return PrivateFacts.of({ pull })
})

export const layer = Layer.effect(PrivateFacts, make)
