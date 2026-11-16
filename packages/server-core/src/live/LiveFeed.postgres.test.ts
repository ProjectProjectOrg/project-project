// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import { CurrentUser, type LiveEvent } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import pg from "pg"
import { describe, expect } from "vitest"

import {
  accessLayer,
  orgScope,
  projectScope,
  testUser
} from "../access/testing"
import * as SyncLog from "../sync/SyncLog"
import * as LiveChanges from "./LiveChanges"
import * as LiveFeed from "./LiveFeed"

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

const query = (text: string, values: ReadonlyArray<unknown>) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query(text, [...values])
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const fixture = () => {
  const suffix = randomUUID()
  return {
    userId: `feed-user-${suffix}`,
    organizationId: `feed-org-${suffix}`,
    orgSlug: `feed-${suffix}`,
    readable: randomUUID(),
    hidden: randomUUID()
  }
}

type Fixture = ReturnType<typeof fixture>

const seed = (f: Fixture) =>
  Effect.gen(function* () {
    yield* query(
      "insert into \"user\" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $1 || '@example.test', true, now(), now())",
      [f.userId]
    )
    yield* query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $2, now())",
      [f.organizationId, f.orgSlug]
    )
    yield* query(
      "insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, 'member', now())",
      [randomUUID(), f.organizationId, f.userId]
    )
    for (const [projectId, slug, key] of [
      [f.readable, "readable", "R"],
      [f.hidden, "hidden", "H"]
    ])
      yield* query(
        "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $3, $5, $2, 'folder', 'blue', $4, now())",
        [projectId, slug, f.organizationId, f.userId, key]
      )
    yield* Effect.addFinalizer(() =>
      query("delete from organization where id = $1", [f.organizationId]).pipe(
        Effect.andThen(query('delete from "user" where id = $1', [f.userId]))
      )
    )
  })

const layerFor = (f: Fixture) =>
  LiveFeed.layer.pipe(
    Layer.provide(
      accessLayer({
        org: orgScope("member", {
          userId: f.userId,
          organizationId: f.organizationId,
          orgSlug: f.orgSlug
        }),
        projects: [
          projectScope("member", "developer", {
            userId: f.userId,
            organizationId: f.organizationId,
            orgSlug: f.orgSlug,
            projectId: f.readable,
            slug: "readable"
          })
        ]
      })
    ),
    Layer.provideMerge(LiveChanges.layer),
    Layer.provideMerge(SyncLog.layer),
    Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
  )

const changesOnly = (event: LiveEvent) => event.kind !== "heartbeat"

const ticketIds = (events: ReadonlyArray<LiveEvent>) =>
  events.map((event) => (event.kind === "ticket" ? event.id : event.kind))

const ticket = (id: string) => [{ kind: "ticket", id, op: "upsert" }] as const

describe.skipIf(!databaseUrl)("LiveFeed Postgres", () => {
  const f = fixture()

  it.live(
    "replays what a viewer missed after its cursor and never streams unreadable projects",
    () =>
      Effect.gen(function* () {
        yield* seed(f)
        const feed = yield* LiveFeed.LiveFeed
        const log = yield* SyncLog.SyncLog
        const connect = (after: string | undefined, count: number) =>
          feed.forCurrentUser(after).pipe(
            Effect.flatMap((stream) =>
              stream.pipe(Stream.take(count), Stream.runCollect)
            ),
            Effect.provideService(CurrentUser, testUser(f.userId)),
            Effect.timeout("10 seconds")
          )

        const first = yield* Effect.forkChild(connect(undefined, 2))
        yield* Effect.sleep("300 millis")
        yield* log.append(f.hidden, ticket("T-99"))
        yield* log.append(f.readable, ticket("T-1"))
        const opened = yield* Fiber.join(first)
        expect(ticketIds(opened)).toEqual(["heartbeat", "T-1"])

        yield* log.append(f.readable, ticket("T-2"))
        yield* log.append(f.hidden, ticket("T-98"))
        yield* log.append(f.readable, ticket("T-3"))
        const cursor = opened.at(-1)?.cursor
        const replayed = yield* feed.forCurrentUser(cursor).pipe(
          Effect.flatMap((stream) =>
            stream.pipe(
              Stream.filter(changesOnly),
              Stream.take(2),
              Stream.runCollect
            )
          ),
          Effect.provideService(CurrentUser, testUser(f.userId)),
          Effect.timeout("10 seconds")
        )
        expect(ticketIds(replayed)).toEqual(["T-2", "T-3"])

        yield* log.bumpGeneration(f.readable)
        const reset = yield* connect(replayed.at(-1)?.cursor, 1)
        expect(ticketIds(reset)).toEqual(["resync"])
      }).pipe(Effect.provide(layerFor(f))),
    { timeout: 30_000 }
  )
})
