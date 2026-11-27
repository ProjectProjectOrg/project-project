// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  ActivityActor,
  NotFound,
  OrgScope,
  ProjectScope,
  TicketId,
  TicketStatus,
  UserId
} from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import * as Access from "../access/Access"
import { orgScope, projectScope } from "../access/testing"
import type { TicketScopedChange } from "../activity/changes"
import * as TicketActivity from "../activity/TicketActivity"
import * as Markdown from "../markdown/Markdown"
import * as Users from "../users/Users"
import { InboxNotice, stageInbox } from "./events"
import * as Inbox from "./Inbox"
import { applyInbox } from "./inboxEntries"

const { Client } = pg
const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  ) {
    throw new Error("Test requires an isolated local database")
  }
  process.env.DATABASE_URL = databaseUrl
}

const ticketId = Schema.decodeUnknownSync(TicketId)
const status = Schema.decodeUnknownSync(TicketStatus)
const userId = Schema.decodeUnknownSync(UserId)

const withClient = <A>(use: (client: pg.Client) => Promise<A>) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return await use(client)
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-inbox-"
    })
    return Layer.mergeAll(TicketActivity.layer, Inbox.layer).pipe(
      Layer.provideMerge(Users.layer),
      Layer.provideMerge(
        Markdown.layer.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
            )
          )
        )
      ),
      Layer.provideMerge(Access.layer),
      Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const seedProject = Effect.gen(function* () {
  const suffix = randomUUID().slice(0, 8)
  const fixture = {
    ann: `inbox-ann-${suffix}`,
    bob: `inbox-bob-${suffix}`,
    carl: `inbox-carl-${suffix}`,
    organizationId: `inbox-org-${suffix}`,
    orgSlug: `inbox-${suffix}`,
    slug: `inbox-${suffix}`,
    projectId: randomUUID()
  }
  const people = [fixture.ann, fixture.bob, fixture.carl]
  yield* withClient(async (client) => {
    await client.query(
      `insert into organization (id, name, slug, created_at)
         values ($1, 'Inbox', $2, now())`,
      [fixture.organizationId, fixture.orgSlug]
    )
    for (const id of people) {
      await client.query(
        `insert into "user" (id, name, email, created_at, updated_at)
           values ($1, $1, $2, now(), now())`,
        [id, `${id}@example.com`]
      )
      await client.query(
        `insert into member (id, organization_id, user_id, role, created_at)
           values ($1, $2, $1, 'member', now())`,
        [id, fixture.organizationId]
      )
    }
    await client.query(
      `insert into project_index
           (id, slug, organization_id, key, name, icon, color, created_by, created_at)
         values ($1, $2, $3, 'T', 'Inbox', 'folder', 'blue', $4, now())`,
      [fixture.projectId, fixture.slug, fixture.organizationId, fixture.ann]
    )
    for (const id of people) {
      await client.query(
        `insert into project_member (project_id, organization_id, user_id, role_id)
           values ($1, $2, $3, 'pm')`,
        [fixture.projectId, fixture.organizationId, id]
      )
    }
    for (const [id, state] of [
      ["T-1", "todo"],
      ["T-2", "todo"],
      ["T-3", "done"]
    ]) {
      await client.query(
        `insert into ticket_index
             (organization_id, project_id, ticket_id, title, status, priority, rank, created_by, created_at, updated_at)
           values ($1, $2, $3, $3, $4, 'med', 'a0', $5, now(), now())`,
        [fixture.organizationId, fixture.projectId, id, state, fixture.ann]
      )
    }
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        fixture.organizationId
      ])
      await client.query(`delete from "user" where id = any($1)`, [people])
    })
  )
  return fixture
})

type Project = Effect.Success<typeof seedProject>

const sql = (query: string, params: ReadonlyArray<unknown>) =>
  withClient((client) => client.query(query, [...params]))

const subscribe = (project: Project, ticket: string, user: string) =>
  sql(
    `insert into ticket_subscription (project_id, ticket_id, user_id, subscribed)
       values ($1, $2, $3, true)`,
    [project.projectId, ticket, user]
  )

const record = (
  project: Project,
  actor: ActivityActor["Service"],
  input: Readonly<{
    ticket?: string
    changes?: ReadonlyArray<TicketScopedChange>
    notices?: ReadonlyArray<InboxNotice>
    finished?: ReadonlySet<string>
  }>
) =>
  Effect.flatMap(TicketActivity.TicketActivity, (activity) =>
    activity.record(
      project.orgSlug,
      project.slug,
      { kind: "ticket", id: input.ticket ?? "T-1", content: null },
      input.changes ?? [],
      null,
      Effect.void,
      [],
      { notices: input.notices ?? [], finished: input.finished ?? null }
    )
  ).pipe(Effect.provideService(ActivityActor, actor))

const entries = (project: Project) =>
  sql(
    `select id, ticket_id, user_id, key, kind, state, cleared_by, revision, event_count, latest, read_by_client_name
       from inbox_entry where project_id = $1 order by ticket_id, user_id, key`,
    [project.projectId]
  ).pipe(
    Effect.map((result) =>
      result.rows.map((row) => ({
        id: row.id as string,
        ticket: row.ticket_id,
        user: row.user_id,
        key: row.key,
        kind: row.kind,
        state: row.state,
        clearedBy: row.cleared_by,
        revision: row.revision,
        count: row.event_count,
        latest: row.latest.kind,
        readBy: row.read_by_client_name
      }))
    )
  )

const entryOf = (project: Project, user: string, key: string) =>
  Effect.map(entries(project), (all) => {
    const found = all.find((entry) => entry.user === user && entry.key === key)
    if (found === undefined) throw new Error(`no ${key} entry for ${user}`)
    return found
  })

const asOrgMember = (project: Project, user: string) =>
  Effect.provideService(
    OrgScope,
    orgScope("member", {
      userId: user,
      organizationId: project.organizationId,
      orgSlug: project.orgSlug
    })
  )

const assign = (who: string) => [
  {
    ticketId: ticketId("T-1"),
    change: {
      kind: "assignees_changed" as const,
      added: [userId(who)],
      removed: []
    }
  }
]

describe.skipIf(!databaseUrl)("inbox", () => {
  it.live(
    "gives each reason its own entry, and never tells the person acting",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        yield* subscribe(project, "T-1", project.ann)
        yield* subscribe(project, "T-1", project.bob)
        yield* subscribe(project, "T-1", project.carl)
        yield* record(project, ActivityActor.user(project.ann), {
          changes: assign(project.carl),
          notices: [
            InboxNotice.commented({
              authorId: project.ann,
              commentId: "c1",
              threadId: "c1"
            }),
            InboxNotice.mentioned({
              userId: project.carl,
              commentId: "c1",
              threadId: "c1"
            })
          ]
        })
        expect(yield* entries(project)).toMatchObject([
          { user: project.bob, key: "updates", state: "unread" },
          { user: project.carl, key: "assigned", kind: "assigned" },
          { user: project.carl, key: "mention:thread:c1", kind: "mentioned" }
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "a mention in another thread is another entry; a repeat updates it",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const mention = (commentId: string, threadId: string) =>
          record(project, ActivityActor.user(project.ann), {
            notices: [
              InboxNotice.mentioned({
                userId: project.bob,
                commentId,
                threadId
              })
            ]
          })
        yield* mention("c1", "c1")
        yield* mention("c2", "c2")
        yield* mention("c3", "c1")
        expect(yield* entries(project)).toMatchObject([
          { key: "mention:thread:c1", revision: 2, count: 2 },
          { key: "mention:thread:c2", revision: 1, count: 1 }
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("your agent replying in the thread clears that mention", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        notices: [
          InboxNotice.mentioned({
            userId: project.bob,
            commentId: "c1",
            threadId: "c1"
          }),
          InboxNotice.mentioned({
            userId: project.bob,
            commentId: null,
            threadId: null
          })
        ]
      })
      yield* record(
        project,
        ActivityActor.agent(project.bob, { id: "cc", name: "Claude Code" }),
        {
          notices: [
            InboxNotice.commented({
              authorId: project.bob,
              commentId: "c2",
              threadId: "c1"
            })
          ]
        }
      )
      expect(yield* entries(project)).toMatchObject([
        { key: "mention:description", state: "unread" },
        { key: "mention:thread:c1", state: "cleared", clearedBy: "replied" }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("hides entries from a project the person was removed from", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        notices: [
          InboxNotice.mentioned({
            userId: project.bob,
            commentId: "c1",
            threadId: "c1"
          })
        ]
      })
      const inbox = yield* Inbox.Inbox
      const asBob = asOrgMember(project, project.bob)
      expect(yield* inbox.count().pipe(asBob)).toBe(1)
      yield* sql(
        "delete from project_member where project_id = $1 and user_id = $2",
        [project.projectId, project.bob]
      )
      expect(yield* inbox.list({}).pipe(asBob)).toEqual([])
      expect(yield* inbox.count().pipe(asBob)).toBe(0)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("pages older entries after the last one listed", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      for (const thread of ["c1", "c2", "c3"])
        yield* record(project, ActivityActor.user(project.ann), {
          notices: [
            InboxNotice.mentioned({
              userId: project.bob,
              commentId: thread,
              threadId: thread
            })
          ]
        })
      const inbox = yield* Inbox.Inbox
      const first = yield* inbox
        .list({ limit: 2 })
        .pipe(asOrgMember(project, project.bob))
      const last = first.at(-1)
      expect(first).toHaveLength(2)
      if (last === undefined) return
      const rest = yield* inbox
        .list({ before: { at: last.latestAt, id: last.id } })
        .pipe(asOrgMember(project, project.bob))
      expect(
        [...first, ...rest]
          .map((entry) => entry.commentId ?? "")
          .toSorted((a, b) => a.localeCompare(b))
      ).toEqual(["c1", "c2", "c3"])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("an older action never reads newer updates for its actor", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-1", project.bob)
      yield* record(project, ActivityActor.user(project.ann), {
        changes: assign(project.carl)
      })
      const earlier = DateTime.formatIso(
        DateTime.subtract(DateTime.nowUnsafe(), { hours: 1 })
      )
      yield* applyInbox(
        project.projectId,
        stageInbox({
          ticketId: "T-1",
          occurredAt: earlier,
          actor: ActivityActor.user(project.bob),
          cause: null,
          changes: [],
          notices: [],
          finished: null,
          statusBefore: null,
          touched: true
        })
      )
      expect(yield* entryOf(project, project.bob, "updates")).toMatchObject({
        state: "unread"
      })
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("read and delete apply only to the revision the person saw", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      const mention = (commentId: string) =>
        record(project, ActivityActor.user(project.ann), {
          notices: [
            InboxNotice.mentioned({
              userId: project.bob,
              commentId,
              threadId: "c1"
            })
          ]
        })
      yield* mention("c1")
      const seen = yield* entryOf(project, project.bob, "mention:thread:c1")
      yield* mention("c2")
      const inbox = yield* Inbox.Inbox
      const stale = yield* inbox
        .markRead(seen.id, seen.revision)
        .pipe(asOrgMember(project, project.bob))
      expect(stale).toMatchObject({ state: "unread", revision: 2 })
      const read = yield* inbox
        .markRead(seen.id, 2)
        .pipe(asOrgMember(project, project.bob))
      expect(read).toMatchObject({ state: "read", revision: 2 })
      const deleted = yield* inbox
        .remove(seen.id, 2)
        .pipe(asOrgMember(project, project.bob))
      expect(deleted).toMatchObject({ state: "cleared", clearedBy: "deleted" })
      yield* mention("c3")
      expect(
        yield* entryOf(project, project.bob, "mention:thread:c1")
      ).toMatchObject({ state: "unread", clearedBy: null, revision: 3 })
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("an entry belongs to its person; others get NotFound", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        changes: assign(project.bob)
      })
      const entry = yield* entryOf(project, project.bob, "assigned")
      const error = yield* Effect.flip(
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.markRead(entry.id, 1)
        ).pipe(asOrgMember(project, project.carl))
      )
      expect(error).toBeInstanceOf(NotFound)
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("mark all read clears assignments and updates, keeps mentions", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-2", project.bob)
      yield* record(project, ActivityActor.user(project.ann), {
        changes: assign(project.bob),
        notices: [
          InboxNotice.mentioned({
            userId: project.bob,
            commentId: "c1",
            threadId: "c1"
          })
        ]
      })
      yield* record(project, ActivityActor.user(project.ann), {
        ticket: "T-2",
        notices: [
          InboxNotice.commented({
            authorId: project.ann,
            commentId: "c9",
            threadId: "c9"
          })
        ]
      })
      const count = yield* Effect.flatMap(Inbox.Inbox, (inbox) =>
        inbox.markAllRead(
          DateTime.toDate(DateTime.makeUnsafe("2100-01-01T00:00:00.000Z"))
        )
      ).pipe(asOrgMember(project, project.bob))
      expect(count).toBe(3)
      expect(yield* entries(project)).toMatchObject([
        { ticket: "T-1", key: "assigned", state: "cleared", clearedBy: "read" },
        { ticket: "T-1", key: "mention:thread:c1", state: "read" },
        { ticket: "T-2", key: "updates", state: "cleared", clearedBy: "read" }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("a subscriber counts every change in one write", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-1", project.bob)
      yield* record(project, ActivityActor.user(project.ann), {
        changes: [
          {
            ticketId: ticketId("T-1"),
            change: {
              kind: "status_changed",
              from: status("todo"),
              to: status("doing")
            }
          },
          ...assign(project.ann)
        ]
      })
      expect(yield* entryOf(project, project.bob, "updates")).toMatchObject({
        count: 2,
        latest: "reassigned"
      })
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "lists the person's entries newest first, with the ticket and actor",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        yield* record(project, ActivityActor.user(project.ann), {
          changes: assign(project.bob)
        })
        yield* record(project, ActivityActor.user(project.carl), {
          ticket: "T-2",
          notices: [
            InboxNotice.mentioned({
              userId: project.bob,
              commentId: "c1",
              threadId: "c1"
            })
          ]
        })
        const inbox = yield* Inbox.Inbox
        const listed = yield* inbox
          .list({})
          .pipe(asOrgMember(project, project.bob))
        expect(listed).toMatchObject([
          {
            kind: "mentioned",
            state: "unread",
            ticket: { id: "T-2", title: "T-2", projectSlug: project.slug },
            actor: { kind: "user", user: { id: project.carl } },
            latest: { kind: "mentioned", commentId: "c1" },
            excerpt: null
          },
          {
            kind: "assigned",
            ticket: { id: "T-1" },
            actor: { kind: "user", user: { id: project.ann } }
          }
        ])
        expect(
          yield* inbox.count().pipe(asOrgMember(project, project.bob))
        ).toBe(2)
        yield* inbox
          .markRead(listed[1].id, listed[1].revision)
          .pipe(asOrgMember(project, project.bob))
        expect(
          (yield* inbox.list({}).pipe(asOrgMember(project, project.bob))).map(
            (entry) => entry.kind
          )
        ).toEqual(["mentioned"])
        expect(
          (yield* inbox
            .list({ state: "all" })
            .pipe(asOrgMember(project, project.bob))).length
        ).toBe(2)
        expect(
          yield* inbox.count().pipe(asOrgMember(project, project.bob))
        ).toBe(1)
        expect(
          yield* inbox.list({}).pipe(asOrgMember(project, project.carl))
        ).toEqual([])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("unblocks a waiting ticket once its last open blocker finishes", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-2", project.bob)
      for (const blocker of ["T-1", "T-3"])
        yield* sql(
          `insert into ticket_relation_index (project_id, from_ticket_id, to_ticket_id, kind)
             values ($1, 'T-2', $2, 'blocked_by')`,
          [project.projectId, blocker]
        )
      yield* record(project, ActivityActor.user(project.ann), {
        changes: [
          {
            ticketId: ticketId("T-1"),
            change: {
              kind: "status_changed",
              from: status("todo"),
              to: status("done")
            }
          }
        ],
        finished: new Set(["done"])
      })
      expect(yield* entries(project)).toMatchObject([
        {
          ticket: "T-2",
          user: project.bob,
          key: "updates",
          latest: "unblocked"
        }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("opening the ticket elsewhere reads its entries", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        changes: assign(project.bob)
      })
      yield* Effect.flatMap(Inbox.Inbox, (inbox) =>
        inbox.markTicketRead("T-1")
      ).pipe(
        Effect.provideService(
          ProjectScope,
          projectScope("member", "pm", {
            userId: project.bob,
            organizationId: project.organizationId,
            orgSlug: project.orgSlug,
            slug: project.slug,
            projectId: project.projectId
          })
        )
      )
      expect(yield* entries(project)).toMatchObject([
        { user: project.bob, key: "assigned", state: "cleared", count: 0 }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("drops a ticket's entries when the ticket is removed", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        notices: [
          InboxNotice.mentioned({
            userId: project.bob,
            commentId: null,
            threadId: null
          })
        ]
      })
      yield* Effect.flatMap(TicketActivity.TicketActivity, (activity) =>
        activity.removeTicket(project.orgSlug, project.slug, "T-1")
      )
      expect(yield* entries(project)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
