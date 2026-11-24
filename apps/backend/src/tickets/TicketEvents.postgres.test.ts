import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Stream from "effect/Stream"
import { describe, expect } from "vitest"

import * as TicketEvents from "./TicketEvents"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const organization = "ticket-events-org"
const project = "7d1f4c3e-2f6a-4b8e-9c1d-5a6b7c8d9e0f"

const payload = (project: string, kind: string, id: string | null) =>
  JSON.stringify({ project, kind, id })

describe.skipIf(databaseUrl === undefined)("ticket event subscriptions", () => {
  const url = new URL(
    databaseUrl ?? "postgres://localhost/projectproject_effect_v4_skipped"
  )
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  )
    throw new Error("Test requires an isolated local database")

  const pg = PgClient.layer({ url: Redacted.make(url.href) })
  const live = Layer.provideMerge(TicketEvents.layer, pg)

  it.live("limits each account to 32 live streams across projects", () =>
    Effect.gen(function* () {
      const events = yield* TicketEvents.TicketEvents
      for (let index = 0; index < 3; index++)
        expect(yield* events.subscribe("project", "account")).not.toBeNull()
      for (let index = 0; index < 28; index++)
        expect(
          yield* events.subscribe("other-project", "account")
        ).not.toBeNull()

      yield* Effect.scoped(
        Effect.gen(function* () {
          expect(yield* events.subscribe("project", "account")).not.toBeNull()
          expect(
            yield* events.subscribe("another-project", "account")
          ).toBeNull()
          expect(
            yield* events.subscribe("project", "other-account")
          ).not.toBeNull()
        })
      )
      expect(
        yield* events.subscribe("another-project", "account")
      ).not.toBeNull()
    }).pipe(Effect.scoped, Effect.provide(live))
  )

  it.live(
    "delivers changes made close together as one batch of distinct changes, ignoring other projects",
    () =>
      Effect.gen(function* () {
        const events = yield* TicketEvents.TicketEvents
        const pg = yield* PgClient.PgClient
        const batchProject = "b339c884-cae7-4a3b-ac7e-859db5fc69d9"
        const stream = yield* events.subscribe(batchProject, "account")
        if (stream === null) throw new Error("Stream was rejected")
        const first = yield* stream.pipe(Stream.runHead, Effect.forkScoped)
        yield* pg`select pg_notify('project_sync', ${payload("other", "tickets", "T-1")})
          union all select pg_notify('project_sync', ${payload(batchProject, "tickets", "T-1")})
          union all select pg_notify('project_sync', ${payload(batchProject, "comments", "T-1")})
          union all select pg_notify('project_sync', ${payload(batchProject, "tickets", "T-2")})`
        yield* Effect.sleep("10 millis")
        yield* pg`select pg_notify('project_sync', ${payload(batchProject, "tickets", "T-1")})`
        const batch = yield* Fiber.join(first).pipe(Effect.timeout("1 second"))
        expect(Option.getOrElse(batch, () => [])).toEqual([
          { kind: "tickets", id: "T-1" },
          { kind: "comments", id: "T-1" },
          { kind: "tickets", id: "T-2" }
        ])
      }).pipe(Effect.scoped, Effect.provide(live))
  )

  it.live(
    "notifies a project of its ticket index writes and not of identical rewrites",
    () =>
      Effect.gen(function* () {
        const events = yield* TicketEvents.TicketEvents
        const pg = yield* PgClient.PgClient
        yield* pg`insert into organization (id, name, slug, created_at)
          values (${organization}, 'Events', ${`events-${organization}`}, now())`
        yield* pg`insert into project_index (id, slug, organization_id, key, name, icon, color, created_by)
          values (${project}, 'events', ${organization}, 'T', 'Events', 'box', 'gray', 'user')`
        yield* Effect.addFinalizer(() =>
          Effect.all(
            [
              pg`delete from ticket_index where project_id = ${project}`,
              pg`delete from project_index where id = ${project}`,
              pg`delete from organization where id = ${organization}`
            ],
            { discard: true }
          ).pipe(Effect.orDie)
        )
        const stream = yield* events.subscribe(project, "account")
        if (stream === null) throw new Error("Stream was rejected")
        const write = (ticket: string, title: string) =>
          pg`insert into ticket_index (organization_id, project_id, ticket_id, title, status, priority, rank, created_by, created_at, updated_at)
            values (${organization}, ${project}, ${ticket}, ${title}, 'todo', 'med', 'a', 'user', 'epoch', 'epoch')
            on conflict (project_id, ticket_id) do update set title = excluded.title`
        const next = Effect.sleep("200 millis").pipe(
          Effect.andThen(
            stream.pipe(Stream.runHead, Effect.timeout("1 second"))
          ),
          Effect.map(Option.getOrElse(() => []))
        )

        yield* write("T-1", "First")
        expect(yield* next).toEqual([{ kind: "tickets", id: "T-1" }])
        yield* write("T-1", "First")
        yield* write("T-2", "Second")
        expect(yield* next).toEqual([{ kind: "tickets", id: "T-2" }])
      }).pipe(Effect.scoped, Effect.provide(live))
  )

  it.live(
    "expands a ticket edit to its parent, children and relation peers and reports removed edges",
    () =>
      Effect.gen(function* () {
        const org = "ticket-dependencies"
        const scope = "c246617a-4571-437b-97d7-1bdbb304f30d"
        const pg = yield* PgClient.PgClient
        yield* pg`insert into organization (id, name, slug, created_at) values (${org}, 'Dependencies', ${org}, now())`
        yield* pg`insert into project_index (id, slug, organization_id, key, name, icon, color, created_by)
        values (${scope}, 'dependencies', ${org}, 'T', 'Events', 'box', 'gray', 'user')`
        yield* Effect.addFinalizer(() =>
          Effect.all(
            [
              pg`delete from ticket_relation_index where project_id = ${scope}`,
              pg`delete from ticket_index where project_id = ${scope}`,
              pg`delete from project_index where id = ${scope}`,
              pg`delete from organization where id = ${org}`
            ],
            { discard: true }
          ).pipe(Effect.orDie)
        )
        yield* pg`insert into ticket_index (organization_id, project_id, ticket_id, parent, title, status, priority, rank, created_by, created_at, updated_at)
        select ${org}, ${scope}, id, parent, id, 'todo', 'med', 'a', 'user', timestamp 'epoch', timestamp 'epoch'
        from (values ('T-1',null),('T-2','T-1'),('T-3','T-2'),('T-4',null),('T-5',null)) as tickets(id,parent)`
        yield* pg`insert into ticket_relation_index values (${scope}, 'T-4', 'T-2', 'related')`
        const events = Context.get(
          yield* Layer.build(TicketEvents.layer),
          TicketEvents.TicketEvents
        )
        const stream = yield* events.subscribe(scope, "account")
        if (stream === null) throw new Error("Stream was rejected")
        yield* pg`select pg_notify('project_sync', json_build_object('project', ${scope}::text, 'kind', 'project', 'id', null)::text)`
        yield* stream.pipe(
          Stream.takeUntil((changes) =>
            changes.some(({ kind }) => kind === "project")
          ),
          Stream.runDrain,
          Effect.timeout("2 seconds")
        )
        const batch = stream.pipe(
          Stream.runHead,
          Effect.timeout("2 seconds"),
          Effect.map(
            (result) =>
              new Set(Option.getOrElse(result, () => []).map(({ id }) => id))
          )
        )
        yield* pg`update ticket_index set title = 'Renamed' where project_id = ${scope} and ticket_id = 'T-2'`
        expect(yield* batch).toEqual(new Set(["T-1", "T-2", "T-3", "T-4"]))
        yield* pg`delete from ticket_relation_index where project_id = ${scope}`
        expect(yield* batch).toEqual(new Set(["T-1", "T-2", "T-3", "T-4"]))
      }).pipe(Effect.scoped, Effect.provide(pg))
  )

  it.live("collapses an overflowing burst into one project change", () =>
    Effect.gen(function* () {
      const events = yield* TicketEvents.TicketEvents
      const pg = yield* PgClient.PgClient
      const stream = yield* events.subscribe("project", "account")
      if (stream === null) throw new Error("Stream was rejected")
      yield* pg`select pg_notify('project_sync', json_build_object('project', 'project', 'kind', 'tickets', 'id', 'T-' || n)::text)
        from generate_series(1, 100) n`
      yield* Effect.sleep("200 millis")
      const batch = yield* stream.pipe(
        Stream.runHead,
        Effect.timeout("1 second")
      )
      expect(Option.getOrElse(batch, () => [])).toEqual([
        { kind: "project", id: null }
      ])
    }).pipe(Effect.scoped, Effect.provide(live))
  )
})
