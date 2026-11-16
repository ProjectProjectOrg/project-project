// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { Project } from "@pp/access/roles"
import { Db, DbLive, PgLive } from "@pp/db"
import {
  groupIndex,
  groupMemberIndex,
  projectTag,
  ticketIndex
} from "@pp/db/schema"
import {
  type ProjectChanges,
  type ProjectScope,
  type ProjectSnapshot,
  type SnapshotPage,
  snapshotFromPages,
  type SyncChangeRef
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"
import pg from "pg"
import { describe, expect } from "vitest"

import * as ProjectFacts from "./ProjectFacts"
import * as SyncLog from "./SyncLog"

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

const TestLayer = ProjectFacts.layer.pipe(
  Layer.provideMerge(SyncLog.layer),
  Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
)

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

const seed = Effect.gen(function* () {
  const organizationId = `facts-${randomUUID()}`
  const projectId = randomUUID()
  const userId = `facts-${randomUUID()}`
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [organizationId]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Facts', 'folder', 'blue', 'test-user', now())",
      [projectId, organizationId]
    )
    await client.query(
      `insert into "user" (id, name, email, created_at, updated_at) values ($1, 'Test', $1, now(), now())`,
      [userId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        organizationId
      ])
      await client.query(`delete from "user" where id = $1`, [userId])
    })
  )
  return { organizationId, projectId, userId }
})

type Seeded = Effect.Success<typeof seed>

const scopeOf = (
  seeded: Seeded,
  permissions: ProjectScope["Service"]["permissions"] = Project.pm
): ProjectScope["Service"] => ({
  userId: seeded.userId,
  organizationId: seeded.organizationId,
  orgSlug: seeded.organizationId,
  orgRole: "member",
  projectId: seeded.projectId,
  slug: seeded.organizationId,
  role: "pm",
  permissions
})

const writes = (seeded: Seeded) =>
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const log = yield* SyncLog.SyncLog
    const { projectId, organizationId, userId } = seeded
    const logged = <A, E, R>(
      ref: SyncChangeRef,
      write: Effect.Effect<A, E, R>
    ) =>
      sql
        .withTransaction(Effect.andThen(write, log.append(projectId, [ref])))
        .pipe(Effect.orDie)

    const ticket = (id: string, title: string, archived = false) => {
      const row = {
        organizationId,
        projectId,
        ticketId: id,
        title,
        status: "todo",
        priority: "med" as const,
        rank: id,
        branch: `feat/${id}`,
        archivedAt: archived ? now : null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      }
      return logged(
        { kind: "ticket", id, op: "upsert" },
        db
          .insert(ticketIndex)
          .values(row)
          .onConflictDoUpdate({
            target: [ticketIndex.projectId, ticketIndex.ticketId],
            set: row
          })
      )
    }
    const removeTicket = (id: string) =>
      logged(
        { kind: "ticket", id, op: "delete" },
        db
          .delete(ticketIndex)
          .where(
            and(
              eq(ticketIndex.projectId, projectId),
              eq(ticketIndex.ticketId, id)
            )
          )
      )
    const tag = (name: string, color: string) =>
      logged(
        { kind: "tag", id: name, op: "upsert" },
        db
          .insert(projectTag)
          .values({ projectId, name, color, createdBy: userId })
          .onConflictDoUpdate({
            target: [projectTag.projectId, projectTag.name],
            set: { color }
          })
      )
    const group = (id: string, tickets: ReadonlyArray<string>) => {
      const row = {
        projectId,
        groupId: id,
        kind: "sprint" as const,
        name: id,
        color: "blue",
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      }
      return logged(
        { kind: "group", id, op: "upsert" },
        Effect.gen(function* () {
          yield* db
            .insert(groupIndex)
            .values(row)
            .onConflictDoUpdate({
              target: [groupIndex.projectId, groupIndex.groupId],
              set: row
            })
          yield* db
            .delete(groupMemberIndex)
            .where(
              and(
                eq(groupMemberIndex.projectId, projectId),
                eq(groupMemberIndex.groupId, id)
              )
            )
          if (tickets.length > 0)
            yield* db.insert(groupMemberIndex).values(
              tickets.map((ticketId, position) => ({
                projectId,
                groupId: id,
                ticketId,
                position
              }))
            )
        })
      )
    }
    return { ticket, removeTicket, tag, group }
  })

const now = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T00:00:00Z"))

const byId = <A>(facts: ReadonlyArray<A>, id: (fact: A) => string) =>
  new Map(facts.map((fact) => [id(fact), fact]))

const apply = (
  snapshot: ProjectSnapshot,
  changes: ProjectChanges
): ProjectSnapshot => {
  const merge = <A>(
    current: ReadonlyArray<A>,
    upserts: ReadonlyArray<A>,
    deletes: ReadonlyArray<string>,
    id: (fact: A) => string
  ) => {
    const facts = byId(current, id)
    for (const removed of deletes) facts.delete(removed)
    for (const fact of upserts) facts.set(id(fact), fact)
    return [...facts.values()]
  }
  return {
    ...snapshot,
    cursor: changes.cursor,
    project: changes.project ?? snapshot.project,
    tickets: merge(
      snapshot.tickets,
      changes.upserts.tickets,
      changes.deletes.tickets,
      (fact) => fact.id
    ),
    groups: merge(
      snapshot.groups,
      changes.upserts.groups,
      changes.deletes.groups,
      (fact) => fact.id
    ),
    statuses: merge(
      snapshot.statuses,
      changes.upserts.statuses,
      changes.deletes.statuses,
      (fact) => fact.slug
    ),
    tags: merge(
      snapshot.tags,
      changes.upserts.tags,
      changes.deletes.tags,
      (fact) => fact.name
    ),
    members: merge(
      snapshot.members,
      changes.upserts.members,
      changes.deletes.members,
      (fact) => fact.userId
    )
  }
}

const sortedBy = <A>(facts: ReadonlyArray<A>, id: (fact: A) => string) =>
  facts.toSorted((a, b) => id(a).localeCompare(id(b)))

const normalized = (snapshot: ProjectSnapshot) => ({
  ...snapshot,
  tickets: sortedBy(snapshot.tickets, (fact) => fact.id),
  groups: sortedBy(snapshot.groups, (fact) => fact.id),
  statuses: sortedBy(snapshot.statuses, (fact) => fact.slug),
  tags: sortedBy(snapshot.tags, (fact) => fact.name),
  members: sortedBy(snapshot.members, (fact) => fact.userId)
})

const pageOf = (
  facts: ProjectFacts.ProjectFacts["Service"],
  scope: ProjectScope["Service"],
  query: Parameters<ProjectFacts.ProjectFacts["Service"]["pull"]>[1]
) =>
  facts
    .pull(scope, query)
    .pipe(
      Effect.flatMap((sync) =>
        sync.kind === "snapshot"
          ? Effect.succeed(sync)
          : Effect.die(new Error("expected a snapshot page"))
      )
    )

const snapshotOf = (
  facts: ProjectFacts.ProjectFacts["Service"],
  scope: ProjectScope["Service"],
  between: (pageIndex: number) => Effect.Effect<unknown> = () => Effect.void
) =>
  Effect.gen(function* () {
    let page = yield* pageOf(facts, scope, {})
    let pages: Array<SnapshotPage> = [page]
    let start = page.start
    while (page.next !== null) {
      yield* between(pages.length)
      page = yield* pageOf(facts, scope, { page: page.next })
      if (page.start === null) pages.push(page)
      else {
        pages = [page]
        start = page.start
      }
    }
    if (start === null) return yield* Effect.die(new Error("no start page"))
    return snapshotFromPages(start, pages, page.base)
  })

const changesOf = (
  facts: ProjectFacts.ProjectFacts["Service"],
  scope: ProjectScope["Service"],
  after: string
) =>
  facts
    .pull(scope, { after })
    .pipe(
      Effect.flatMap((sync) =>
        sync.kind === "changes"
          ? Effect.succeed(sync)
          : Effect.die(new Error("expected changes"))
      )
    )

const caughtUp = (
  facts: ProjectFacts.ProjectFacts["Service"],
  scope: ProjectScope["Service"],
  snapshot: ProjectSnapshot
) =>
  Effect.gen(function* () {
    let current = snapshot
    let pages = 0
    for (;;) {
      const changes = yield* changesOf(facts, scope, current.cursor)
      current = apply(current, changes)
      pages++
      if (!changes.more) return { snapshot: current, pages }
    }
  })

describe.skipIf(!databaseUrl)("ProjectFacts Postgres", () => {
  it.effect(
    "takes every snapshot at exactly one log position while writes land",
    () =>
      Effect.gen(function* () {
        const facts = yield* ProjectFacts.ProjectFacts
        const seeded = yield* seed
        const scope = scopeOf(seeded)
        const { ticket } = yield* writes(seeded)

        const [, snapshots] = yield* Effect.all(
          [
            Effect.all(
              Array.from({ length: 40 }, (_, n) => ticket(`T-${n + 1}`, "t")),
              { concurrency: 8 }
            ),
            Effect.all(
              Array.from({ length: 20 }, () => snapshotOf(facts, scope)),
              { concurrency: 4 }
            )
          ],
          { concurrency: "unbounded" }
        )

        for (const snapshot of snapshots)
          expect(snapshot.tickets.length).toBe(
            Number(snapshot.cursor.split(".")[1])
          )
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect(
    "catching up from any earlier cursor reproduces a fresh snapshot",
    () =>
      Effect.gen(function* () {
        const facts = yield* ProjectFacts.ProjectFacts
        const seeded = yield* seed
        const scope = scopeOf(seeded)
        const { ticket, removeTicket, tag, group } = yield* writes(seeded)
        const ops = [
          () => ticket("T-1", "one"),
          () => ticket("T-2", "two"),
          () => tag("bug", "red"),
          () => group("G-1", ["T-1", "T-2"]),
          () => ticket("T-1", "one, renamed"),
          () => ticket("T-3", "three"),
          () => removeTicket("T-2"),
          () => tag("bug", "green"),
          () => group("G-1", ["T-3", "T-1"]),
          () => ticket("T-3", "three", true),
          () => ticket("T-4", "four")
        ]

        const history = [yield* snapshotOf(facts, scope)]
        for (const op of ops) {
          yield* op()
          history.push(yield* snapshotOf(facts, scope))
        }
        const fresh = yield* snapshotOf(facts, scope)

        for (const earlier of history) {
          const changes = yield* changesOf(facts, scope, earlier.cursor)
          expect(normalized(apply(earlier, changes))).toEqual(normalized(fresh))
        }
        const removed = yield* facts.pull(scope, {
          after: history[6]?.cursor
        })
        expect(removed).toMatchObject({ deletes: { tickets: ["T-2"] } })
        expect(
          fresh.tickets.find((fact) => fact.id === "T-3")?.archivedAt
        ).toBeInstanceOf(Date)
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("leaves out GitHub fields for a viewer without GitHub read", () =>
    Effect.gen(function* () {
      const facts = yield* ProjectFacts.ProjectFacts
      const seeded = yield* seed
      const { ticket } = yield* writes(seeded)
      const before = yield* snapshotOf(facts, scopeOf(seeded))
      yield* ticket("T-1", "one")

      const snapshot = yield* snapshotOf(facts, scopeOf(seeded, Project.client))
      const changes = yield* facts.pull(scopeOf(seeded, Project.client), {
        after: before.cursor
      })

      expect(snapshot.tickets[0]?.git).toBeNull()
      expect(changes).toMatchObject({
        kind: "changes",
        upserts: { tickets: [{ id: "T-1", git: null }] }
      })
      expect(
        (yield* snapshotOf(facts, scopeOf(seeded))).tickets[0]?.git
      ).toMatchObject({ branch: "feat/T-1" })
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("answers a cursor from an earlier generation with a snapshot", () =>
    Effect.gen(function* () {
      const facts = yield* ProjectFacts.ProjectFacts
      const log = yield* SyncLog.SyncLog
      const seeded = yield* seed
      const scope = scopeOf(seeded)
      const { ticket } = yield* writes(seeded)
      yield* ticket("T-1", "one")
      const before = yield* snapshotOf(facts, scope)

      yield* log.bumpGeneration(seeded.projectId)

      expect(yield* facts.pull(scope, { after: before.cursor })).toMatchObject({
        kind: "snapshot",
        base: "2.0",
        tickets: [{ id: "T-1" }]
      })
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect(
    "a snapshot paged while writes land matches a fresh one after catching up from its base",
    () =>
      Effect.gen(function* () {
        const facts = yield* ProjectFacts.ProjectFacts
        const seeded = yield* seed
        const scope = scopeOf(seeded)
        const { ticket, removeTicket, group } = yield* writes(seeded)
        for (let n = 1; n <= 10; n++) yield* ticket(`T-${n}`, `ticket ${n}`)
        yield* group("G-1", ["T-1", "T-2", "T-3", "T-4", "T-5"])
        const edits = [
          () => ticket("T-1", "renamed behind the scan"),
          () => ticket("T-0", "created behind the scan"),
          () => removeTicket("T-9"),
          () => group("G-1", ["T-5", "T-0"]),
          () => ticket("T-99", "created ahead of the scan")
        ]
        const paged = yield* snapshotOf(facts, scope, (index) =>
          (edits[index - 1] ?? (() => Effect.void))()
        )
        const { snapshot } = yield* caughtUp(facts, scope, paged)
        expect(normalized(snapshot)).toEqual(
          normalized(yield* snapshotOf(facts, scope))
        )
      }).pipe(
        Effect.provideService(ProjectFacts.SyncPageLimits, {
          tickets: 3,
          members: 2,
          facts: 2000,
          entries: 20000
        }),
        Effect.provide(TestLayer),
        Effect.scoped
      )
  )

  it.effect("catches up a long backlog in pages instead of a snapshot", () =>
    Effect.gen(function* () {
      const facts = yield* ProjectFacts.ProjectFacts
      const seeded = yield* seed
      const scope = scopeOf(seeded)
      const { ticket } = yield* writes(seeded)
      const before = yield* snapshotOf(facts, scope)
      for (let n = 1; n <= 9; n++) yield* ticket(`T-${n}`, `ticket ${n}`)
      const { snapshot, pages } = yield* caughtUp(facts, scope, before)
      expect(pages).toBe(5)
      expect(normalized(snapshot)).toEqual(
        normalized(yield* snapshotOf(facts, scope))
      )
    }).pipe(
      Effect.provideService(ProjectFacts.SyncPageLimits, {
        tickets: 1000,
        members: 5000,
        facts: 2,
        entries: 20000
      }),
      Effect.provide(TestLayer),
      Effect.scoped
    )
  )
})
