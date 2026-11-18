// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  ActivityActor,
  GroupColor,
  GroupId,
  type GroupKind,
  OrgScope,
  PinOrderKey,
  PinTarget,
  ProjectScope,
  type SidebarPin,
  TicketId
} from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import pg from "pg"
import { describe, expect } from "vitest"

import * as Access from "../access/Access"
import { orgScope, projectScope } from "../access/testing"
import * as TicketActivity from "../activity/TicketActivity"
import * as GroupDocs from "../groups/GroupDocs"
import * as Markdown from "../markdown/Markdown"
import * as SidebarPins from "./SidebarPins"

const { Client } = pg

const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))
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
      prefix: "projectproject-sidebar-pins-"
    })
    return SidebarPins.layer.pipe(
      Layer.provideMerge(Access.layer),
      Layer.provideMerge(GroupDocs.layer),
      Layer.provideMerge(TicketActivity.layer),
      Layer.provideMerge(
        Markdown.layer.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ PROJECTS_DIR: root })
            )
          )
        )
      ),
      Layer.provide(DbLive.pipe(Layer.provideMerge(PgLive)))
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const seed = Effect.gen(function* () {
  const suffix = randomUUID().slice(0, 8)
  const fixture = {
    member: `pins-member-${suffix}`,
    organizationId: `pins-org-${suffix}`,
    orgSlug: `pins-${suffix}`,
    slug: `pins-${suffix}`,
    projectId: randomUUID(),
    hiddenSlug: `pins-hidden-${suffix}`,
    hiddenProjectId: randomUUID()
  }
  yield* withClient(async (client) => {
    await client.query(
      `insert into "user" (id, name, email, created_at, updated_at)
         values ($1, $1, $2, now(), now())`,
      [fixture.member, `${fixture.member}@example.com`]
    )
    await client.query(
      `insert into organization (id, name, slug, created_at)
         values ($1, 'Pins', $2, now())`,
      [fixture.organizationId, fixture.orgSlug]
    )
    await client.query(
      `insert into member (id, organization_id, user_id, role, created_at)
         values ($1, $2, $1, 'member', now())`,
      [fixture.member, fixture.organizationId]
    )
    for (const [id, slug, key] of [
      [fixture.projectId, fixture.slug, "T"],
      [fixture.hiddenProjectId, fixture.hiddenSlug, "H"]
    ]) {
      await client.query(
        `insert into project_index
             (id, slug, organization_id, key, name, icon, color, created_by, created_at)
           values ($1, $2, $3, $4, 'Pins', 'folder', 'blue', $5, now())`,
        [id, slug, fixture.organizationId, key, fixture.member]
      )
    }
    await client.query(
      `insert into project_member (project_id, organization_id, user_id, role_id)
         values ($1, $2, $3, 'pm')`,
      [fixture.projectId, fixture.organizationId, fixture.member]
    )
    for (const [projectId, ticketId] of [
      [fixture.projectId, "T-1"],
      [fixture.projectId, "T-2"],
      [fixture.hiddenProjectId, "H-1"]
    ]) {
      await client.query(
        `insert into ticket_index
             (organization_id, project_id, ticket_id, title, status, priority, rank, created_by, created_at, updated_at)
           values ($1, $2, $3, $3, 'todo', 'med', 'a0', $4, now(), now())`,
        [fixture.organizationId, projectId, ticketId, fixture.member]
      )
    }
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        fixture.organizationId
      ])
      await client.query(`delete from "user" where id = $1`, [fixture.member])
    })
  )
  return fixture
})

type Fixture = Effect.Success<typeof seed>

const inProject = (fixture: Fixture) =>
  Effect.provideService(
    ProjectScope,
    projectScope("member", "pm", {
      userId: fixture.member,
      organizationId: fixture.organizationId,
      orgSlug: fixture.orgSlug,
      slug: fixture.slug,
      projectId: fixture.projectId
    })
  )

const inOrg = (fixture: Fixture) =>
  Effect.provideService(
    OrgScope,
    orgScope("member", {
      userId: fixture.member,
      organizationId: fixture.organizationId,
      orgSlug: fixture.orgSlug
    })
  )

const ticket = (id: string) =>
  PinTarget.cases.ticket.make({ ref: TicketId.make(id) })

const sprint = (id: string) =>
  PinTarget.cases.sprint.make({ ref: GroupId.make(id) })

const createGroup = (fixture: Fixture, id: string, kind: GroupKind) =>
  Effect.flatMap(GroupDocs.GroupDocs, (docs) =>
    docs.create(fixture.orgSlug, fixture.slug, {
      id: GroupId.make(id),
      name: `Group ${id}`,
      kind,
      tickets: [],
      color: GroupColor.make("#abcdef"),
      startsAt: isoDate("2026-11-02T00:00:00Z"),
      endsAt: isoDate("2026-11-16T00:00:00Z"),
      completedAt: null,
      createdBy: fixture.member,
      createdAt: isoDate("2026-11-01T00:00:00Z"),
      updatedAt: isoDate("2026-11-01T00:00:00Z"),
      body: ""
    })
  ).pipe(
    Effect.orDie,
    Effect.provideService(ActivityActor, ActivityActor.user(fixture.member))
  )

const insertPin = (
  fixture: Fixture,
  projectId: string,
  kind: string,
  ref: string
) =>
  withClient((client) =>
    client.query(
      `insert into sidebar_pin (user_id, organization_id, project_id, kind, ref, order_key)
         values ($1, $2, $3, $4, $5, 'a0')`,
      [fixture.member, fixture.organizationId, projectId, kind, ref]
    )
  )

const refs = (pins: ReadonlyArray<SidebarPin>) =>
  pins.map((pin) => `${pin.projectSlug}:${pin.ref}`)

describe.skipIf(!databaseUrl)("sidebar pins", () => {
  it.live("pins idempotently and puts new pins on top", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const pins = yield* SidebarPins.SidebarPins
      const first = yield* pins.pin(ticket("T-1")).pipe(inProject(fixture))
      yield* pins.pin(ticket("T-2")).pipe(inProject(fixture))
      const again = yield* pins.pin(ticket("T-1")).pipe(inProject(fixture))
      expect(again).toEqual(first)
      expect(first).toMatchObject({
        projectSlug: fixture.slug,
        _tag: "ticket",
        ref: "T-1",
        ticket: { id: "T-1", title: "T-1", status: "todo", archivedAt: null }
      })
      const listed = yield* pins.list().pipe(inOrg(fixture))
      expect(refs(listed)).toEqual([
        `${fixture.slug}:T-2`,
        `${fixture.slug}:T-1`
      ])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("refuses missing tickets and groups that aren't sprints", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const pins = yield* SidebarPins.SidebarPins
      yield* createGroup(fixture, "G-1", "epic")
      const missing = yield* Effect.flip(
        pins.pin(ticket("T-99")).pipe(inProject(fixture))
      )
      const epic = yield* Effect.flip(
        pins.pin(sprint("G-1")).pipe(inProject(fixture))
      )
      expect(missing._tag).toBe("NotFound")
      expect(epic._tag).toBe("NotFound")
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live(
    "lists resolved sprints and drops pins that are missing or unreadable",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const pins = yield* SidebarPins.SidebarPins
        yield* createGroup(fixture, "G-1", "sprint")
        yield* pins.pin(sprint("G-1")).pipe(inProject(fixture))
        yield* insertPin(fixture, fixture.projectId, "ticket", "T-99")
        yield* insertPin(fixture, fixture.projectId, "sprint", "G-9")
        yield* insertPin(fixture, fixture.hiddenProjectId, "ticket", "H-1")
        const listed = yield* pins.list().pipe(inOrg(fixture))
        expect(listed).toEqual([
          expect.objectContaining({
            _tag: "sprint",
            ref: "G-1",
            sprint: {
              id: "G-1",
              name: "Group G-1",
              startsAt: isoDate("2026-11-02T00:00:00Z"),
              endsAt: isoDate("2026-11-16T00:00:00Z"),
              completedAt: null
            }
          })
        ])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("reorders and unpins, and unpinning twice is fine", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const pins = yield* SidebarPins.SidebarPins
      yield* pins.pin(ticket("T-1")).pipe(inProject(fixture))
      yield* pins.pin(ticket("T-2")).pipe(inProject(fixture))
      const moved = yield* pins
        .reorder("ticket", "T-2", PinOrderKey.make("a5"))
        .pipe(inProject(fixture))
      expect(moved.orderKey).toBe("a5")
      expect(refs(yield* pins.list().pipe(inOrg(fixture)))).toEqual([
        `${fixture.slug}:T-1`,
        `${fixture.slug}:T-2`
      ])
      yield* pins.unpin("ticket", "T-1").pipe(inProject(fixture))
      yield* pins.unpin("ticket", "T-1").pipe(inProject(fixture))
      expect(refs(yield* pins.list().pipe(inOrg(fixture)))).toEqual([
        `${fixture.slug}:T-2`
      ])
      const gone = yield* Effect.flip(
        pins
          .reorder("ticket", "T-1", PinOrderKey.make("a1"))
          .pipe(inProject(fixture))
      )
      expect(gone._tag).toBe("NotFound")
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )

  it.live("drops a ticket's pins when the ticket is removed", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const pins = yield* SidebarPins.SidebarPins
      const activity = yield* TicketActivity.TicketActivity
      yield* pins.pin(ticket("T-1")).pipe(inProject(fixture))
      yield* activity.removeTicket(fixture.orgSlug, fixture.slug, "T-1")
      const rows = yield* withClient((client) =>
        client.query("select ref from sidebar_pin where project_id = $1", [
          fixture.projectId
        ])
      )
      expect(rows.rows).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
