// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import { ActivityActor, ProjectScope, TicketId } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import * as TicketActivity from "../activity/TicketActivity"
import * as Markdown from "../markdown/Markdown"
import * as Users from "../users/Users"
import type { SubscriptionIntent, SubscriptionReason } from "./intents"
import * as TicketSubscriptions from "./TicketSubscriptions"

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
      prefix: "projectproject-ticket-subscriptions-"
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
      TicketSubscriptions.layer.pipe(Layer.provide(Users.layer))
    ).pipe(Layer.provide(DbLive.pipe(Layer.provideMerge(PgLive))))
  })
).pipe(Layer.provideMerge(BunServices.layer))

const seedProject = Effect.gen(function* () {
  const suffix = randomUUID().slice(0, 8)
  const fixture = {
    member: `subscriptions-member-${suffix}`,
    other: `subscriptions-other-${suffix}`,
    outsider: `subscriptions-outsider-${suffix}`,
    organizationId: `subscriptions-org-${suffix}`,
    orgSlug: `subscriptions-${suffix}`,
    slug: `subscriptions-${suffix}`,
    projectId: randomUUID()
  }
  const people = [fixture.member, fixture.other, fixture.outsider]
  yield* withClient(async (client) => {
    for (const id of people) {
      await client.query(
        `insert into "user" (id, name, email, created_at, updated_at)
           values ($1, $1, $2, now(), now())`,
        [id, `${id}@example.com`]
      )
    }
    await client.query(
      `insert into organization (id, name, slug, created_at)
         values ($1, 'Subscriptions', $2, now())`,
      [fixture.organizationId, fixture.orgSlug]
    )
    for (const id of people) {
      await client.query(
        `insert into member (id, organization_id, user_id, role, created_at)
           values ($1, $2, $1, 'member', now())`,
        [id, fixture.organizationId]
      )
    }
    await client.query(
      `insert into project_index
           (id, slug, organization_id, key, name, icon, color, created_by, created_at)
         values ($1, $2, $3, 'T', 'Subscriptions', 'folder', 'blue', $4, now())`,
      [fixture.projectId, fixture.slug, fixture.organizationId, fixture.member]
    )
    for (const id of [fixture.member, fixture.other]) {
      await client.query(
        `insert into project_member (project_id, organization_id, user_id, role_id)
           values ($1, $2, $3, 'pm')`,
        [fixture.projectId, fixture.organizationId, id]
      )
    }
    await client.query(
      `insert into ticket_index
           (organization_id, project_id, ticket_id, title, status, priority, rank, created_by, created_at, updated_at)
         values ($1, $2, 'T-1', 'Subscribe me', 'todo', 'med', 'a0', $3, now(), now())`,
      [fixture.organizationId, fixture.projectId, fixture.member]
    )
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

const record = (
  project: Project,
  subscriptions: ReadonlyArray<
    Readonly<{ userId: string; reason: SubscriptionReason }>
  >,
  write: Effect.Effect<void, string> = Effect.void
) =>
  Effect.flatMap(TicketActivity.TicketActivity, (activity) =>
    activity.record(
      project.orgSlug,
      project.slug,
      { kind: "ticket", id: "T-1", content: null },
      [],
      null,
      write,
      [],
      subscriptions.map(
        (subscribe): SubscriptionIntent => ({
          ticketId: ticketId("T-1"),
          ...subscribe
        })
      )
    )
  ).pipe(
    Effect.provideService(ActivityActor, ActivityActor.user(project.member))
  )

const subscriptionRows = (project: Project) =>
  withClient((client) =>
    client.query<{ user_id: string; subscribed: boolean }>(
      `select user_id, subscribed from ticket_subscription
         where project_id = $1 order by user_id`,
      [project.projectId]
    )
  ).pipe(
    Effect.map((result) =>
      result.rows.map((row) => [row.user_id, row.subscribed])
    )
  )

const asMember = (project: Project) =>
  Effect.provideService(
    ProjectScope,
    projectScope("member", "pm", {
      userId: project.member,
      organizationId: project.organizationId,
      orgSlug: project.orgSlug,
      slug: project.slug,
      projectId: project.projectId
    })
  )

describe.skipIf(!databaseUrl)("ticket subscriptions", () => {
  it.live("commits a write's subscriptions only once the write lands", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* Effect.exit(
        record(
          project,
          [{ userId: project.member, reason: "created" }],
          Effect.fail("disk")
        )
      )
      expect(yield* subscriptionRows(project)).toEqual([])
      yield* record(project, [{ userId: project.member, reason: "created" }])
      expect(yield* subscriptionRows(project)).toEqual([[project.member, true]])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "keeps an unsubscribe through a comment but not through an assignment",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const subscriptions = yield* TicketSubscriptions.TicketSubscriptions
        yield* subscriptions.setSubscribed("T-1", false).pipe(asMember(project))
        yield* record(project, [
          { userId: project.member, reason: "commented" }
        ])
        expect(yield* subscriptionRows(project)).toEqual([
          [project.member, false]
        ])
        yield* record(project, [{ userId: project.member, reason: "assigned" }])
        expect(yield* subscriptionRows(project)).toEqual([
          [project.member, true]
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("skips people who aren't members of the project", () =>
    Effect.gen(function* () {
      const project = yield* seedProject
      yield* record(project, [
        { userId: project.outsider, reason: "mentioned" },
        { userId: project.other, reason: "mentioned" }
      ])
      expect(yield* subscriptionRows(project)).toEqual([[project.other, true]])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "lists subscribers in the order they subscribed and whether you are one",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const subscriptions = yield* TicketSubscriptions.TicketSubscriptions
        yield* record(project, [{ userId: project.other, reason: "assigned" }])
        yield* record(project, [
          { userId: project.member, reason: "mentioned" }
        ])
        const listed = yield* subscriptions.list("T-1").pipe(asMember(project))
        expect(listed.subscribed).toBe(true)
        expect(listed.subscribers.map((user) => user.id)).toEqual([
          project.other,
          project.member
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "drops subscriptions when the ticket is removed or the subscriber leaves",
    () =>
      Effect.gen(function* () {
        const project = yield* seedProject
        const activity = yield* TicketActivity.TicketActivity
        yield* record(project, [
          { userId: project.member, reason: "created" },
          { userId: project.other, reason: "assigned" }
        ])
        yield* withClient((client) =>
          client.query(
            "delete from project_member where project_id = $1 and user_id = $2",
            [project.projectId, project.other]
          )
        )
        expect(yield* subscriptionRows(project)).toEqual([
          [project.member, true]
        ])
        yield* activity.removeTicket(project.orgSlug, project.slug, "T-1")
        expect(yield* subscriptionRows(project)).toEqual([])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
