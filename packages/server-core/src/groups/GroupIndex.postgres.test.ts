// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import { type Group, GroupColor, GroupId, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import pg from "pg"
import { describe, expect } from "vitest"

import * as SyncLog from "../sync/SyncLog"
import * as GroupIndex from "./GroupIndex"

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

const query = <A>(text: string, values: ReadonlyArray<unknown> = []) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return (await client.query(text, [...values])).rows as Array<A>
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const seedProject = Effect.gen(function* () {
  const slug = `groups-${randomUUID()}`
  const projectId = randomUUID()
  yield* query(
    "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
    [slug]
  )
  yield* query(
    "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Groups', 'folder', 'blue', 'test-user', now())",
    [projectId, slug]
  )
  yield* Effect.addFinalizer(() =>
    query("delete from organization where id = $1", [slug])
  )
  return { projectId, orgSlug: slug, slug }
})

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const sprint = (tickets: ReadonlyArray<string>): Group => ({
  id: GroupId.make("G-1"),
  name: "Sprint 1",
  kind: "sprint",
  tickets: tickets.map((id) => TicketId.make(id)),
  color: GroupColor.make("#10b981"),
  startsAt: at("2026-04-01T00:00:00.000Z"),
  endsAt: at("2026-04-14T00:00:00.000Z"),
  completedAt: null,
  createdBy: "user-1",
  createdAt: at("2026-03-30T00:00:00.000Z"),
  updatedAt: at("2026-04-02T00:00:00.000Z")
})

const TestLayer = GroupIndex.layer.pipe(
  Layer.provideMerge(SyncLog.layer),
  Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
)

describe.skipIf(!databaseUrl)("GroupIndex Postgres", () => {
  it.effect(
    "writes a group, its ordered membership and one log entry together",
    () =>
      Effect.gen(function* () {
        const index = yield* GroupIndex.GroupIndex
        const log = yield* SyncLog.SyncLog
        const project = yield* seedProject
        yield* index.upsert(
          project.orgSlug,
          project.slug,
          sprint(["T-2", "T-1"])
        )

        expect(
          yield* query(
            "select ticket_id, position from group_member_index where project_id = $1 order by position",
            [project.projectId]
          )
        ).toEqual([
          { ticket_id: "T-2", position: 0 },
          { ticket_id: "T-1", position: 1 }
        ])
        const entries = yield* log.entriesAfter(
          project.projectId,
          { generation: 1, sequence: 0 },
          10
        )
        expect(entries.map((entry) => entry.changes)).toEqual([
          [{ kind: "group", id: "G-1", op: "upsert" }]
        ])
      }).pipe(Effect.provide(TestLayer))
  )

  it.effect(
    "rebuilds from the group files only when they differ, starting a new sync generation",
    () =>
      Effect.gen(function* () {
        const index = yield* GroupIndex.GroupIndex
        const log = yield* SyncLog.SyncLog
        const project = yield* seedProject
        yield* index.upsert(project.orgSlug, project.slug, sprint(["T-1"]))

        expect(yield* index.rebuildProject(project, [sprint(["T-1"])])).toBe(
          false
        )
        expect((yield* log.head(project.projectId)).generation).toBe(1)

        expect(
          yield* index.rebuildProject(project, [sprint(["T-1", "T-3"])])
        ).toBe(true)
        expect(yield* log.head(project.projectId)).toEqual({
          generation: 2,
          sequence: 0
        })
      }).pipe(Effect.provide(TestLayer))
  )
})
