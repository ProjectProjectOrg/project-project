import { Db } from "@pp/db"
import { inboxEntry, projectIndex, ticketIndex } from "@pp/db/schema"
import {
  ActivityActor,
  InboxEntryId,
  InboxEvent,
  NotFound,
  OrgScope,
  permits,
  ProjectScope,
  Slug,
  TicketId,
  type InboxClearedBy,
  type InboxEntry,
  type InboxEntryState,
  type InboxListScope,
  type User
} from "@pp/shared"
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql
} from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import * as Access from "../access/Access"
import { actorOf, presentActor, storedActorUserId } from "../activity/actorRow"
import {
  parseCommentsRegion,
  splitDescriptionAndCommentsRegion
} from "../comments/comments-region"
import * as Markdown from "../markdown/Markdown"
import * as Users from "../users/Users"
import { markUnread, read, remove, type EntryValue } from "./entries"
import { excerptParts, mentionedUserIds, paragraphMentioning } from "./excerpt"
import { lockTickets } from "./inboxEntries"

export type InboxListOptions = Readonly<{
  since?: Date
  state?: InboxListScope
  before?: Readonly<{ at: Date; id: string }>
  limit?: number
}>

const LIST_LIMIT = 200
const LIST_MAX = 1000

const entryId = Schema.decodeSync(InboxEntryId)
const ticketIdOf = Schema.decodeSync(TicketId)
const slugOf = Schema.decodeSync(Slug)
const eventOf = Schema.decodeSync(InboxEvent)

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
    ) => Effect.Effect<EntryState, NotFound, OrgScope | ActivityActor>
    markUnread: (
      entryId: string
    ) => Effect.Effect<EntryState, NotFound, OrgScope>
    remove: (
      entryId: string,
      revision: number
    ) => Effect.Effect<EntryState, NotFound, OrgScope>
    markAllRead: (
      upTo: Date
    ) => Effect.Effect<number, never, OrgScope | ActivityActor>
    list: (
      options: InboxListOptions
    ) => Effect.Effect<ReadonlyArray<InboxEntry>, never, OrgScope>
    count: () => Effect.Effect<number, never, OrgScope>
  }>
>()("@pp/server-core/inbox/Inbox") {}

const readerName = Effect.map(ActivityActor, (actor) =>
  actor.kind === "agent" ? actor.clientName : null
)

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
  const markdown = yield* Markdown.Markdown
  const users = yield* Users.Users
  const access = yield* Access.Access

  const readableProjects = Effect.map(access.projectsInOrg(), (scopes) =>
    scopes
      .filter((scope) => permits(scope.permissions, { ticket: ["read"] }))
      .map((scope) => scope.projectId)
  )

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
    const reader = yield* readerName
    return yield* change(entryId, (value) => read(value, revision, reader))
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
    const reader = yield* readerName
    const projects = yield* readableProjects
    if (projects.length === 0) return 0
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
              readByClientName: reader
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

  const ticketSources = (
    orgSlug: string,
    tickets: ReadonlyArray<Readonly<{ slug: string; ticketId: string }>>
  ) =>
    Effect.forEach(
      tickets,
      ({ slug, ticketId }) =>
        markdown.readTicketParts(orgSlug, slug, ticketId).pipe(
          Effect.map((parts) => {
            const { description } = splitDescriptionAndCommentsRegion(
              parts.description
            )
            const comments = new Map(
              parseCommentsRegion(parts.region).map((block) => [
                block.id,
                block.body
              ])
            )
            return [`${slug}/${ticketId}`, { description, comments }] as const
          }),
          Effect.catch(() => Effect.succeed(null))
        ),
      { concurrency: 8 }
    ).pipe(
      Effect.map(
        (found) =>
          new Map(found.flatMap((entry) => (entry === null ? [] : [entry])))
      )
    )

  const list = Effect.fn("Inbox.list")(function* (options: InboxListOptions) {
    const scope = yield* OrgScope
    const readable = yield* readableProjects
    if (readable.length === 0) return []
    const state = options.state ?? "active"
    const rows = yield* db
      .select({
        entry: inboxEntry,
        slug: projectIndex.slug,
        title: ticketIndex.title
      })
      .from(inboxEntry)
      .innerJoin(projectIndex, eq(projectIndex.id, inboxEntry.projectId))
      .leftJoin(
        ticketIndex,
        and(
          eq(ticketIndex.projectId, inboxEntry.projectId),
          eq(ticketIndex.ticketId, inboxEntry.ticketId)
        )
      )
      .where(
        and(
          eq(inboxEntry.userId, scope.userId),
          eq(projectIndex.organizationId, scope.organizationId),
          inArray(inboxEntry.projectId, readable),
          state === "all"
            ? undefined
            : state === "unread"
              ? eq(inboxEntry.state, "unread")
              : ne(inboxEntry.state, "cleared"),
          options.since === undefined
            ? undefined
            : gte(inboxEntry.latestAt, options.since),
          options.before === undefined
            ? undefined
            : or(
                lt(inboxEntry.latestAt, options.before.at),
                and(
                  eq(inboxEntry.latestAt, options.before.at),
                  lt(inboxEntry.id, options.before.id)
                )
              )
        )
      )
      .orderBy(desc(inboxEntry.latestAt), desc(inboxEntry.id))
      .limit(Math.min(options.limit ?? LIST_LIMIT, LIST_MAX))
      .pipe(Effect.orDie)

    const actors = rows.map(({ entry }) =>
      actorOf({
        ...entry,
        importedName: null,
        importedSource: null,
        importedId: null
      })
    )
    const wantsSource = (entry: (typeof rows)[number]["entry"]) =>
      entry.commentId !== null || entry.key === "mention:description"
    const sources = yield* ticketSources(scope.orgSlug, [
      ...new Map(
        rows
          .filter(({ entry }) => wantsSource(entry))
          .map(({ entry, slug }) => [
            `${slug}/${entry.ticketId}`,
            { slug, ticketId: entry.ticketId }
          ])
      ).values()
    ])
    const sourceOf = ({ entry, slug }: (typeof rows)[number]) => {
      if (!wantsSource(entry)) return null
      const ticket = sources.get(`${slug}/${entry.ticketId}`)
      if (ticket === undefined) return null
      if (entry.commentId !== null)
        return ticket.comments.get(entry.commentId) ?? null
      return paragraphMentioning(ticket.description, scope.userId)
    }
    const texts = rows.map(sourceOf)
    const people = yield* users.fullByIds([
      ...new Set([
        ...actors.flatMap((actor) => {
          const id = storedActorUserId(actor)
          return id === null ? [] : [id]
        }),
        ...texts.flatMap((text) =>
          text === null ? [] : mentionedUserIds(text)
        )
      ])
    ])
    const byId = new Map<string, User>(people.map((user) => [user.id, user]))
    const handles = new Map(
      people.map((user) => [user.id, user.username ?? user.name])
    )
    return rows.map(({ entry, slug, title }, index) => {
      const text = texts[index]
      return {
        id: entryId(entry.id),
        revision: entry.revision,
        kind: entry.kind,
        state: entry.state,
        clearedBy: entry.clearedBy,
        ticket: {
          id: ticketIdOf(entry.ticketId),
          title: title ?? entry.ticketId,
          projectSlug: slugOf(slug)
        },
        actor: presentActor(actors[index], byId),
        latest: eventOf(entry.latest),
        latestAt: entry.latestAt,
        commentId: entry.commentId,
        excerpt: text === null ? null : excerptParts(text, handles),
        eventCount: entry.eventCount,
        readByClientName: entry.readByClientName
      } satisfies InboxEntry
    })
  })

  const countUnread = Effect.fn("Inbox.count")(function* () {
    const scope = yield* OrgScope
    const readable = yield* readableProjects
    if (readable.length === 0) return 0
    const rows = yield* db
      .select({ unread: count() })
      .from(inboxEntry)
      .where(
        and(
          eq(inboxEntry.userId, scope.userId),
          eq(inboxEntry.state, "unread"),
          inArray(inboxEntry.projectId, readable)
        )
      )
      .pipe(Effect.orDie)
    return rows[0]?.unread ?? 0
  })

  return Inbox.of({
    markTicketRead,
    markRead,
    markUnread: markUnreadEntry,
    remove: removeEntry,
    markAllRead,
    list,
    count: countUnread
  })
})

export const layer = Layer.effect(Inbox, make)
