import { Db } from "@pp/db"
import { inboxRow, projectIndex, ticketIndex } from "@pp/db/schema"
import {
  InboxEvent,
  type InboxItem,
  OrgScope,
  ProjectScope,
  TicketId,
  TicketStatus
} from "@pp/shared"
import { and, count, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import * as Access from "../access/Access"
import { actorOf, presentActor } from "../activity/actorRow"
import * as Users from "../users/Users"
import { lockInbox, lockTickets } from "./inboxRows"

const INBOX_LIMIT = 200

const decodeEvent = Schema.decodeUnknownSync(InboxEvent)
const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeStatus = Schema.decodeUnknownSync(TicketStatus)

const mine = (userId: string, projectIds: ReadonlyArray<string>) =>
  and(eq(inboxRow.userId, userId), inArray(inboxRow.projectId, [...projectIds]))

const shown = and(
  ne(inboxRow.state, "done"),
  or(eq(inboxRow.state, "unread"), sql`${inboxRow.direct} <> '[]'::jsonb`)
)

export class Inbox extends Context.Service<
  Inbox,
  Readonly<{
    list: () => Effect.Effect<ReadonlyArray<InboxItem>, never, OrgScope>
    unread: () => Effect.Effect<number, never, OrgScope>
    readAll: () => Effect.Effect<void, never, OrgScope>
    doneAll: () => Effect.Effect<void, never, OrgScope>
    markRead: (ticketId: string) => Effect.Effect<void, never, ProjectScope>
    markUnread: (ticketId: string) => Effect.Effect<void, never, ProjectScope>
    markDone: (ticketId: string) => Effect.Effect<void, never, ProjectScope>
  }>
>()("@pp/server-core/inbox/Inbox") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const access = yield* Access.Access
  const users = yield* Users.Users

  const readableProjectIds = Effect.map(access.projectsInOrg(), (scopes) =>
    scopes
      .filter((scope) => scope.permissions.can({ ticket: ["read"] }))
      .map((scope) => scope.projectId)
  )

  const list = Effect.fn("Inbox.list")(function* () {
    const { userId } = yield* OrgScope
    const projectIds = yield* readableProjectIds
    if (projectIds.length === 0) return []
    const rows = yield* db
      .select({
        row: inboxRow,
        projectSlug: projectIndex.slug,
        title: ticketIndex.title,
        status: ticketIndex.status,
        archivedAt: ticketIndex.archivedAt
      })
      .from(inboxRow)
      .innerJoin(projectIndex, eq(projectIndex.id, inboxRow.projectId))
      .innerJoin(
        ticketIndex,
        and(
          eq(ticketIndex.projectId, inboxRow.projectId),
          eq(ticketIndex.ticketId, inboxRow.ticketId)
        )
      )
      .where(and(mine(userId, projectIds), shown))
      .orderBy(desc(inboxRow.latestAt), desc(inboxRow.ticketId))
      .limit(INBOX_LIMIT)
      .pipe(Effect.orDie)
    const actors = rows.map(({ row }) => actorOf(row))
    const people = yield* users.fullByIds([
      ...new Set(
        actors.flatMap((actor) => (actor.kind === "system" ? [] : actor.userId))
      )
    ])
    const peopleById = new Map(people.map((user) => [user.id, user]))
    return rows.map(
      ({ row, projectSlug, title, status, archivedAt }, index): InboxItem => ({
        projectSlug,
        ticket: {
          id: decodeTicketId(row.ticketId),
          title,
          status: decodeStatus(status),
          archived: archivedAt !== null
        },
        unread: row.state === "unread",
        direct: row.direct.map((entry) => entry.reason),
        latest: decodeEvent(row.latest),
        latestAt: row.latestAt,
        actor: presentActor(actors[index], peopleById),
        unreadCount: row.unreadCount,
        lastReadAt: row.lastReadAt
      })
    )
  })

  const unread = Effect.fn("Inbox.unread")(function* () {
    const { userId } = yield* OrgScope
    const projectIds = yield* readableProjectIds
    if (projectIds.length === 0) return 0
    const [row] = yield* db
      .select({ count: count() })
      .from(inboxRow)
      .where(and(mine(userId, projectIds), eq(inboxRow.state, "unread")))
      .pipe(Effect.orDie)
    return row?.count ?? 0
  })

  const settleAll = (state: "read" | "done") =>
    Effect.gen(function* () {
      const { userId } = yield* OrgScope
      const projectIds = yield* readableProjectIds
      if (projectIds.length === 0) return
      const at = DateTime.toDate(yield* DateTime.now)
      const pending =
        state === "read"
          ? eq(inboxRow.state, "unread")
          : ne(inboxRow.state, "done")
      yield* db
        .transaction(() =>
          Effect.gen(function* () {
            const refs = yield* db
              .select({
                projectId: inboxRow.projectId,
                ticketId: inboxRow.ticketId
              })
              .from(inboxRow)
              .where(and(mine(userId, projectIds), pending))
            yield* lockInbox(db, refs)
            yield* db
              .update(inboxRow)
              .set({
                state:
                  state === "done"
                    ? "done"
                    : sql`case when ${inboxRow.state} = 'done' then 'done' else 'read' end`,
                unreadCount: 0,
                lastReadAt: at,
                readByClientName: null
              })
              .where(
                and(
                  mine(userId, projectIds),
                  pending,
                  lte(inboxRow.latestAt, at)
                )
              )
          })
        )
        .pipe(Effect.orDie)
    })

  const readAll = Effect.fn("Inbox.readAll")(function* () {
    yield* settleAll("read")
  })

  const doneAll = Effect.fn("Inbox.doneAll")(function* () {
    yield* settleAll("done")
  })

  const updateOwnRow = (
    ticketId: string,
    values: PgUpdateSetSource<typeof inboxRow>
  ) =>
    Effect.gen(function* () {
      const scope = yield* ProjectScope
      yield* db
        .transaction(() =>
          lockTickets(db, scope.projectId, [ticketId]).pipe(
            Effect.andThen(
              db
                .update(inboxRow)
                .set(values)
                .where(
                  and(
                    eq(inboxRow.projectId, scope.projectId),
                    eq(inboxRow.ticketId, ticketId),
                    eq(inboxRow.userId, scope.userId)
                  )
                )
            )
          )
        )
        .pipe(Effect.orDie)
    })

  const markRead = Effect.fn("Inbox.markRead")(function* (ticketId: string) {
    yield* updateOwnRow(ticketId, {
      state: sql`case when ${inboxRow.state} = 'done' then 'done' else 'read' end`,
      unreadCount: 0,
      lastReadAt: sql`now()`,
      readByClientName: null
    })
  })

  const markUnread = Effect.fn("Inbox.markUnread")(function* (
    ticketId: string
  ) {
    yield* updateOwnRow(ticketId, {
      state: "unread",
      unreadCount: sql`greatest(${inboxRow.unreadCount}, 1)`
    })
  })

  const markDone = Effect.fn("Inbox.markDone")(function* (ticketId: string) {
    yield* updateOwnRow(ticketId, {
      state: "done",
      unreadCount: 0,
      lastReadAt: sql`now()`,
      readByClientName: null
    })
  })

  return Inbox.of({
    list,
    unread,
    readAll,
    doneAll,
    markRead,
    markUnread,
    markDone
  })
})

export const layer = Layer.effect(Inbox, make)
