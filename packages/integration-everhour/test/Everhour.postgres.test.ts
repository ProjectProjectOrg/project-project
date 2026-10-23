// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  EverhourError,
  EverhourProjectAccessDenied,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import pg from "pg"
import { describe, expect } from "vitest"

import { EverhourApiKeys } from "../src/ApiKeys"
import {
  Everhour,
  type EverhourProject,
  type EverhourShape,
  type EverhourTimeRecord
} from "../src/Client"
import { EverhourHost } from "../src/Host"
import {
  EverhourIntegrations,
  EverhourIntegrationsLive
} from "../src/Integrations"
import {
  EverhourTimeTracking,
  EverhourTimeTrackingLive
} from "../src/TimeTracking"

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

const unexpected = (name: string) => () =>
  Effect.die(new Error(`unexpected ${name} call`))

type FakeEverhour = Readonly<{
  service: EverhourShape
  project: { users: Array<string> }
  assignedWith: Array<string>
  settings: {
    team: ReadonlyArray<string>
    failProjectRead: boolean
    assignDelay: Duration.Input
  }
}>

const userOf = (apiKey: string) => apiKey.replace(/^key-/, "")

const fakeEverhour = (users: ReadonlyArray<string>): FakeEverhour => {
  const project = { users: [...users] }
  const assignedWith: Array<string> = []
  const settings: FakeEverhour["settings"] = {
    team: [],
    failProjectRead: false,
    assignDelay: 0
  }
  const records = new Map<string, EverhourTimeRecord>()
  let nextEntry = 1000
  const remote = (): EverhourProject => ({
    id: "ev:project",
    name: "Website",
    type: "board",
    users: [...project.users]
  })
  const service: EverhourShape = {
    getCurrentUser: unexpected("getCurrentUser"),
    getProject: () =>
      settings.failProjectRead
        ? Effect.fail(new EverhourError({ message: "Everhour is down" }))
        : Effect.sync(remote),
    teamUserIds: () => Effect.sync(() => settings.team),
    createProject: unexpected("createProject"),
    updateProject: () => Effect.succeed(remote()),
    assignProjectUsers: (apiKey, _projectId, next) =>
      Effect.sleep(settings.assignDelay).pipe(
        Effect.andThen(
          Effect.sync(() => {
            assignedWith.push(apiKey)
            project.users = [...next]
            return remote()
          })
        )
      ),
    createSection: (_apiKey, _projectId, input) =>
      Effect.succeed({ id: `section-${input.name}`, ...input }),
    updateSection: (_apiKey, id, input) => Effect.succeed({ id, ...input }),
    getTask: unexpected("getTask"),
    createTask: (_apiKey, _projectId, payload) =>
      Effect.succeed({ id: `task-${payload.name}`, ...payload }),
    updateTask: (_apiKey, id, payload) => Effect.succeed({ id, ...payload }),
    startTimer: unexpected("startTimer"),
    stopTimer: unexpected("stopTimer"),
    getCurrentTimer: unexpected("getCurrentTimer"),
    addTime: (apiKey, input) =>
      Effect.suspend(() => {
        const user = userOf(apiKey)
        if (!project.users.includes(user))
          return Effect.fail(new EverhourProjectAccessDenied())
        const key = `${user}:${input.date}:${input.task}`
        const existing = records.get(key)
        const record: EverhourTimeRecord = {
          id: existing?.id ?? `record-${records.size + 1}`,
          taskId: input.task,
          userId: user,
          seconds: (existing?.seconds ?? 0) + input.time,
          date: input.date,
          comment: input.comment ?? null,
          history: [
            ...(existing?.history ?? []),
            { id: String(nextEntry++), seconds: input.time }
          ]
        }
        records.set(key, record)
        return Effect.succeed(record)
      }),
    createWebhook: unexpected("createWebhook"),
    deleteWebhook: unexpected("deleteWebhook")
  }
  return { service, project, assignedWith, settings }
}

const seed = Effect.gen(function* () {
  const suffix = randomUUID().slice(0, 8)
  const fixture = {
    organizationId: `everhour-org-${suffix}`,
    orgSlug: `everhour-${suffix}`,
    slug: `everhour-${suffix}`,
    projectId: randomUUID(),
    manager: `everhour-manager-${suffix}`,
    developer: `everhour-developer-${suffix}`,
    newcomer: `everhour-newcomer-${suffix}`,
    linkId: randomUUID()
  }
  const people = [fixture.manager, fixture.developer, fixture.newcomer]
  yield* withClient(async (client) => {
    for (const id of people)
      await client.query(
        `insert into "user" (id, name, email, created_at, updated_at)
           values ($1, $1, $2, now(), now())`,
        [id, `${id}@example.com`]
      )
    await client.query(
      `insert into organization (id, name, slug, created_at)
         values ($1, 'Everhour', $2, now())`,
      [fixture.organizationId, fixture.orgSlug]
    )
    await client.query(
      `insert into project_index
           (id, slug, organization_id, key, name, icon, color, created_by, created_at, published_at)
         values ($1, $2, $3, 'T', 'Website', 'folder', 'blue', $4, now(), now())`,
      [fixture.projectId, fixture.slug, fixture.organizationId, fixture.manager]
    )
    for (const id of people)
      await client.query(
        `insert into user_everhour_integration
             (user_id, encrypted_api_key, api_key_nonce, api_key_tag, everhour_user_id)
           values ($1, $2, 'nonce', 'tag', $1)`,
        [id, `key-${id}`]
      )
    const integration = await client.query<{ id: string }>(
      `insert into organization_integration (organization_id, provider, status)
         values ($1, 'everhour', 'active') returning id`,
      [fixture.organizationId]
    )
    await client.query(
      `insert into project_integration_link
           (id, project_id, organization_id, organization_integration_id, provider, status)
         values ($1, $2, $3, $4, 'everhour', 'active')`,
      [
        fixture.linkId,
        fixture.projectId,
        fixture.organizationId,
        integration.rows[0]!.id
      ]
    )
    await client.query(
      `insert into project_everhour_integration
           (project_integration_link_id, organization_id, status, everhour_project_id,
            everhour_project_name, last_sync_actor_user_id)
         values ($1, $2, 'active', 'ev:project', 'Website', $3)`,
      [fixture.linkId, fixture.organizationId, fixture.manager]
    )
    await client.query(
      `insert into everhour_work_type_task_link
           (project_integration_link_id, group_id, work_type_key, everhour_task_id, name, status)
         values ($1, 'G-1', 'development', 'ev:task-dev', 'Sprint 1 — Development', 'active')`,
      [fixture.linkId]
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

type Fixture = Effect.Success<typeof seed>

const servicesLayer = (fixture: Fixture, everhour: FakeEverhour) =>
  Layer.mergeAll(EverhourTimeTrackingLive, EverhourIntegrationsLive).pipe(
    Layer.provide(EverhourApiKeys.layer),
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Everhour, everhour.service),
        Layer.succeed(EverhourHost, {
          project: () =>
            Effect.succeed({
              projectId: fixture.projectId,
              organizationId: fixture.organizationId
            }),
          publishedName: () => Effect.succeed("Website"),
          memberIds: () =>
            Effect.succeed([
              fixture.manager,
              fixture.developer,
              fixture.newcomer
            ]),
          sprints: () =>
            Effect.succeed([
              {
                id: "G-1",
                name: "Sprint 1",
                completed: false,
                tickets: ["T-1", "T-2"]
              }
            ]),
          ticketTitle: (_orgSlug, _slug, id) => Effect.succeed(`Ticket ${id}`),
          timeReadableSlug: () => Effect.succeed(fixture.slug),
          seal: unexpected("seal"),
          open: (sealed) => Effect.succeed(sealed.ciphertext)
        })
      )
    ),
    Layer.provide(DbLive.pipe(Layer.provideMerge(PgLive))),
    Layer.provide(BunServices.layer)
  )

const scopeFor = (fixture: Fixture, userId: string) =>
  ({
    userId,
    organizationId: fixture.organizationId,
    orgSlug: fixture.orgSlug,
    projectId: fixture.projectId,
    slug: fixture.slug
  }) as ProjectScopeShape

const as =
  (fixture: Fixture, userId: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(ProjectScope, scopeFor(fixture, userId)))

const logTime = (ticketId: string, seconds: number) =>
  Effect.flatMap(EverhourTimeTracking, (time) =>
    time.logTime({
      ticketId,
      workTypeKey: "development",
      seconds,
      date: "2026-10-23"
    } as never)
  )

const ticketSeconds = (ticketId: string) =>
  Effect.flatMap(EverhourTimeTracking, (time) =>
    time.ticketTimeSummary(ticketId)
  ).pipe(Effect.map((summary) => summary.totalSeconds))

const recordFor = (fixture: Fixture) =>
  withClient((client) =>
    client.query<{ everhour_time_id: string }>(
      `select distinct everhour_time_id from everhour_time_attribution
         where project_integration_link_id = $1`,
      [fixture.linkId]
    )
  ).pipe(Effect.map((result) => result.rows.map((row) => row.everhour_time_id)))

describe.skipIf(!databaseUrl)("Everhour time tracking", () => {
  it.live(
    "keeps two tickets apart when Everhour merges their time into one record",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager, fixture.developer])
        yield* Effect.gen(function* () {
          const developer = as(fixture, fixture.developer)
          yield* developer(logTime("T-1", 600))
          yield* developer(logTime("T-2", 300))
          expect(yield* recordFor(fixture)).toHaveLength(1)
          expect(yield* developer(ticketSeconds("T-1"))).toBe(600)
          expect(yield* developer(ticketSeconds("T-2"))).toBe(300)
        }).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      }).pipe(Effect.scoped)
  )

  it.live(
    "adds an unassigned member with the last syncing manager's key, keeping existing users",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager, "everhour-only-user"])
        yield* Effect.gen(function* () {
          yield* as(fixture, fixture.newcomer)(logTime("T-1", 900))
          expect(everhour.assignedWith).toEqual([`key-${fixture.manager}`])
          expect(everhour.project.users).toEqual([
            fixture.manager,
            "everhour-only-user",
            fixture.newcomer
          ])
          expect(
            yield* as(fixture, fixture.newcomer)(ticketSeconds("T-1"))
          ).toBe(900)
        }).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      }).pipe(Effect.scoped)
  )

  it.live(
    "reports the access denial when no manager has synced the project",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        yield* withClient((client) =>
          client.query(
            `update project_everhour_integration set last_sync_actor_user_id = null
               where project_integration_link_id = $1`,
            [fixture.linkId]
          )
        )
        const everhour = fakeEverhour([fixture.manager])
        const error = yield* as(
          fixture,
          fixture.newcomer
        )(logTime("T-1", 900)).pipe(
          Effect.flip,
          Effect.provide(servicesLayer(fixture, everhour))
        )
        expect(error._tag).toBe("EverhourProjectAccessDenied")
        expect(everhour.assignedWith).toEqual([])
      }).pipe(Effect.scoped)
  )

  it.live("drops a ticket's time when the record is deleted in Everhour", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const everhour = fakeEverhour([fixture.manager, fixture.developer])
      yield* Effect.gen(function* () {
        const developer = as(fixture, fixture.developer)
        yield* developer(logTime("T-1", 600))
        const [recordId] = yield* recordFor(fixture)
        const time = yield* EverhourTimeTracking
        yield* time.applyWebhookTimeEvent(fixture.linkId, {
          id: recordId!,
          taskId: "ev:task-dev",
          userId: fixture.developer,
          seconds: 0,
          date: "2026-10-23",
          comment: null,
          history: [
            { id: "1000", seconds: 600 },
            { id: "5000", seconds: -600 }
          ]
        })
        expect(yield* developer(ticketSeconds("T-1"))).toBe(0)
      }).pipe(Effect.provide(servicesLayer(fixture, everhour)))
    }).pipe(Effect.scoped)
  )

  it.live(
    "keeps time added in Everhour off the ticket it was not logged against",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager, fixture.developer])
        yield* Effect.gen(function* () {
          const developer = as(fixture, fixture.developer)
          yield* developer(logTime("T-1", 600))
          const [recordId] = yield* recordFor(fixture)
          const time = yield* EverhourTimeTracking
          yield* time.applyWebhookTimeEvent(fixture.linkId, {
            id: recordId!,
            taskId: "ev:task-dev",
            userId: fixture.developer,
            seconds: 1800,
            date: "2026-10-23",
            comment: null,
            history: [
              { id: "1000", seconds: 600 },
              { id: "5000", seconds: 1200 }
            ]
          })
          expect(yield* developer(ticketSeconds("T-1"))).toBe(600)
        }).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      }).pipe(Effect.scoped)
  )

  it.live(
    "lets PP's own write take over an entry the webhook recorded first",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager, fixture.developer])
        yield* Effect.gen(function* () {
          const developer = as(fixture, fixture.developer)
          yield* developer(logTime("T-1", 600))
          const [recordId] = yield* recordFor(fixture)
          const time = yield* EverhourTimeTracking
          yield* time.applyWebhookTimeEvent(fixture.linkId, {
            id: recordId!,
            taskId: "ev:task-dev",
            userId: fixture.developer,
            seconds: 900,
            date: "2026-10-23",
            comment: null,
            history: [
              { id: "1000", seconds: 600 },
              { id: "1001", seconds: 300 }
            ]
          })
          yield* developer(logTime("T-2", 300))
          expect(yield* developer(ticketSeconds("T-1"))).toBe(600)
          expect(yield* developer(ticketSeconds("T-2"))).toBe(300)
        }).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      }).pipe(Effect.scoped)
  )

  it.live(
    "lets both requests through when one member is assigned twice at once",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager])
        everhour.settings.assignDelay = "100 millis"
        yield* Effect.all(
          [
            as(fixture, fixture.newcomer)(logTime("T-1", 600)),
            as(fixture, fixture.newcomer)(logTime("T-2", 300))
          ],
          { concurrency: "unbounded" }
        ).pipe(Effect.provide(servicesLayer(fixture, everhour)))
        expect(everhour.assignedWith).toHaveLength(1)
        expect(everhour.project.users).toEqual([
          fixture.manager,
          fixture.newcomer
        ])
      }).pipe(Effect.scoped)
  )

  it.live("keeps both members when two of them are assigned at once", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const everhour = fakeEverhour([fixture.manager])
      everhour.settings.assignDelay = "100 millis"
      yield* Effect.all(
        [
          as(fixture, fixture.developer)(logTime("T-1", 600)),
          as(fixture, fixture.newcomer)(logTime("T-2", 300))
        ],
        { concurrency: "unbounded" }
      ).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      expect([...everhour.project.users].sort()).toEqual(
        [fixture.manager, fixture.developer, fixture.newcomer].sort()
      )
    }).pipe(Effect.scoped)
  )
})

describe.skipIf(!databaseUrl)("Everhour project sync", () => {
  it.live(
    "assigns project members who connected Everhour without removing anyone",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        yield* withClient((client) =>
          client.query(
            "delete from user_everhour_integration where user_id = $1",
            [fixture.newcomer]
          )
        )
        const everhour = fakeEverhour([fixture.manager, "everhour-only-user"])
        everhour.settings.team = [
          fixture.manager,
          fixture.developer,
          "everhour-only-user"
        ]
        yield* as(
          fixture,
          fixture.manager
        )(
          Effect.flatMap(EverhourIntegrations, (integrations) =>
            integrations.syncProject()
          )
        ).pipe(Effect.provide(servicesLayer(fixture, everhour)))
        expect(everhour.assignedWith).toEqual([`key-${fixture.manager}`])
        expect(everhour.project.users).toEqual([
          fixture.manager,
          "everhour-only-user",
          fixture.developer
        ])
      }).pipe(Effect.scoped)
  )

  it.live("leaves members of another Everhour team out of the project", () =>
    Effect.gen(function* () {
      const fixture = yield* seed
      const everhour = fakeEverhour([fixture.manager])
      everhour.settings.team = [fixture.manager]
      yield* as(
        fixture,
        fixture.manager
      )(
        Effect.flatMap(EverhourIntegrations, (integrations) =>
          integrations.syncProject()
        )
      ).pipe(Effect.provide(servicesLayer(fixture, everhour)))
      expect(everhour.assignedWith).toEqual([])
      expect(everhour.project.users).toEqual([fixture.manager])
    }).pipe(Effect.scoped)
  )

  it.live(
    "keeps the last successful manager when another manager's sync fails",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed
        const everhour = fakeEverhour([fixture.manager])
        everhour.settings.failProjectRead = true
        yield* as(
          fixture,
          fixture.developer
        )(
          Effect.flatMap(EverhourIntegrations, (integrations) =>
            integrations.syncProject()
          )
        ).pipe(Effect.flip, Effect.provide(servicesLayer(fixture, everhour)))
        const [row] = yield* withClient((client) =>
          client.query<{
            last_sync_actor_user_id: string | null
            last_sync_status: string
          }>(
            `select last_sync_actor_user_id, last_sync_status from project_everhour_integration
             where project_integration_link_id = $1`,
            [fixture.linkId]
          )
        ).pipe(Effect.map((result) => result.rows))
        expect(row).toEqual({
          last_sync_actor_user_id: fixture.manager,
          last_sync_status: "error"
        })
      }).pipe(Effect.scoped)
  )
})
