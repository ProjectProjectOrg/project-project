// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  ActivityActor,
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
import type { InboxNotice } from "./events"
import * as Inbox from "./Inbox"

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
    return Layer.mergeAll(
      TicketActivity.layer.pipe(
        Layer.provideMerge(
          Markdown.layer.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
              )
            )
          )
        )
      ),
      Inbox.layer.pipe(Layer.provide(Layer.mergeAll(Access.layer, Users.layer)))
    ).pipe(Layer.provide(DbLive.pipe(Layer.provideMerge(PgLive))))
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
           (id, slug, organization_id, key, name, icon, color, created_by, created_at, published_at)
         values ($1, $2, $3, 'T', 'Inbox', 'folder', 'blue', $4, now(), now())`,
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

const rows = (project: Project) =>
  sql(
    `select ticket_id, user_id, state, unread_count, latest, direct, read_by_client_name
       from inbox_row where project_id = $1 order by ticket_id, user_id`,
    [project.projectId]
  ).pipe(
    Effect.map((result) =>
      result.rows.map((row) => ({
        ticket: row.ticket_id,
        user: row.user_id,
        state: row.state,
        count: row.unread_count,
        latest: row.latest.kind,
        direct: row.direct.map(
          (entry: Readonly<{ reason: string }>) => entry.reason
        ),
        readBy: row.read_by_client_name
      }))
    )
  )

const assign = (project: Project, ticket: string, user: string) =>
  record(project, ActivityActor.user(project.ann), {
    ticket,
    changes: [
      {
        ticketId: ticketId(ticket),
        change: {
          kind: "assignees_changed",
          added: [userId(user)],
          removed: []
        }
      }
    ]
  })

const comment = (project: Project, ticket: string) =>
  record(project, ActivityActor.user(project.ann), {
    ticket,
    notices: [{ kind: "commented", authorId: project.ann, commentId: "c1" }]
  })

const asProjectMember = (project: Project, user: string) =>
  Effect.provideService(
    ProjectScope,
    projectScope("member", "pm", {
      userId: user,
      organizationId: project.organizationId,
      orgSlug: project.orgSlug,
      slug: project.slug,
      projectId: project.projectId
    })
  )

const asOrgMember = (project: Project, user: string) =>
  Effect.provideService(
    OrgScope,
    orgScope("member", {
      userId: user,
      organizationId: project.organizationId,
      orgSlug: project.orgSlug
    })
  )

const inboxOf = (project: Project, user: string) =>
  Effect.flatMap(Inbox.Inbox, (inbox) =>
    Effect.all({ items: inbox.list({}), unread: inbox.unread() })
  ).pipe(
    Effect.map(({ items, unread }) => ({
      tickets: items.map((item) => item.ticket.id),
      unread
    })),
    asOrgMember(project, user)
  )

describe.skipIf(!databaseUrl)("inbox", () => {
  it.live(
    "tells subscribers and mentioned people, never the person acting",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        yield* subscribe(project, "T-1", project.ann)
        yield* subscribe(project, "T-1", project.bob)
        yield* record(project, ActivityActor.user(project.ann), {
          notices: [
            { kind: "commented", authorId: project.ann, commentId: "c1" },
            { kind: "mentioned", userId: project.carl, commentId: "c1" }
          ]
        })
        expect(yield* rows(project)).toMatchObject([
          {
            user: project.bob,
            state: "unread",
            latest: "commented",
            direct: []
          },
          {
            user: project.carl,
            state: "unread",
            latest: "mentioned",
            direct: ["mentioned"]
          }
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("your agent replying resolves your mention and reads for you", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-1", project.bob)
      yield* record(project, ActivityActor.user(project.ann), {
        notices: [{ kind: "mentioned", userId: project.bob, commentId: "c1" }]
      })
      yield* record(
        project,
        ActivityActor.agent(project.bob, { id: "cc", name: "Claude Code" }),
        {
          notices: [
            { kind: "commented", authorId: project.bob, commentId: "c2" }
          ]
        }
      )
      expect(yield* rows(project)).toMatchObject([
        { user: project.bob, state: "done", direct: [], readBy: "Claude Code" }
      ])
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
      expect(yield* rows(project)).toMatchObject([
        { ticket: "T-2", user: project.bob, latest: "unblocked" }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("opening the ticket reads it and resets the count", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        changes: [
          {
            ticketId: ticketId("T-1"),
            change: {
              kind: "assignees_changed",
              added: [userId(project.bob)],
              removed: []
            }
          }
        ]
      })
      yield* Effect.flatMap(Inbox.Inbox, (inbox) => inbox.markRead("T-1")).pipe(
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
      expect(yield* rows(project)).toMatchObject([
        {
          user: project.bob,
          state: "read",
          count: 0,
          direct: ["assigned"],
          readBy: null
        }
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("lists unread rows and rows with open reasons, newest first", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-1", project.bob)
      yield* comment(project, "T-1")
      yield* assign(project, "T-2", project.bob)
      const items = yield* Effect.flatMap(Inbox.Inbox, (inbox) =>
        inbox.list({})
      ).pipe(asOrgMember(project, project.bob))
      expect(items).toMatchObject([
        {
          projectSlug: project.slug,
          ticket: { id: "T-2", title: "T-2", status: "todo" },
          unread: true,
          direct: ["assigned"],
          latest: { kind: "assigned" },
          actor: { kind: "user", user: { id: project.ann } },
          unreadCount: 1
        },
        { ticket: { id: "T-1" }, unread: true, direct: [] }
      ])
      const opened = DateTime.toDate(yield* DateTime.now)
      yield* Effect.forEach(["T-1", "T-2"], (ticket) =>
        Effect.flatMap(Inbox.Inbox, (inbox) => inbox.markRead(ticket)).pipe(
          asProjectMember(project, project.bob)
        )
      )
      expect(yield* inboxOf(project, project.bob)).toEqual({
        tickets: ["T-2"],
        unread: 0
      })
      const sinceOpened = yield* Effect.flatMap(Inbox.Inbox, (inbox) =>
        inbox.list({ readSince: opened })
      ).pipe(asOrgMember(project, project.bob))
      expect(sinceOpened.map((item) => item.ticket.id)).toEqual(["T-2", "T-1"])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("done hides a row until you mark it unread", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* assign(project, "T-1", project.bob)
      const asBob = asProjectMember(project, project.bob)
      yield* Effect.flatMap(Inbox.Inbox, (inbox) => inbox.markDone("T-1")).pipe(
        asBob
      )
      expect(yield* inboxOf(project, project.bob)).toEqual({
        tickets: [],
        unread: 0
      })
      yield* Effect.flatMap(Inbox.Inbox, (inbox) =>
        inbox.markUnread("T-1")
      ).pipe(asBob)
      expect(yield* inboxOf(project, project.bob)).toEqual({
        tickets: ["T-1"],
        unread: 1
      })
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("mark all as read keeps open reasons, mark all as done clears", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* subscribe(project, "T-1", project.bob)
      yield* comment(project, "T-1")
      yield* assign(project, "T-2", project.bob)
      const asBob = asOrgMember(project, project.bob)
      yield* Effect.flatMap(Inbox.Inbox, (inbox) => inbox.readAll()).pipe(asBob)
      expect(yield* inboxOf(project, project.bob)).toEqual({
        tickets: ["T-2"],
        unread: 0
      })
      yield* Effect.flatMap(Inbox.Inbox, (inbox) => inbox.doneAll()).pipe(asBob)
      expect(yield* inboxOf(project, project.bob)).toEqual({
        tickets: [],
        unread: 0
      })
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("drops a ticket's rows when the ticket is removed", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, ActivityActor.user(project.ann), {
        notices: [{ kind: "mentioned", userId: project.bob, commentId: null }]
      })
      yield* Effect.flatMap(TicketActivity.TicketActivity, (activity) =>
        activity.removeTicket(project.orgSlug, project.slug, "T-1")
      )
      expect(yield* rows(project)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
