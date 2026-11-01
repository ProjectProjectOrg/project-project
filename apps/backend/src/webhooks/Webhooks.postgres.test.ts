// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHmac, randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, pgTypes } from "@pp/db"
import { Access } from "@pp/server-core/access/Access"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { TicketActivityLive } from "@pp/server-core/activity/TicketActivityLive"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import { MarkdownLive } from "@pp/server-core/markdown/MarkdownLive"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import { SecretCryptoLive } from "@pp/server-core/storage/SecretCryptoLive"
import {
  TicketDocs,
  type TicketDocument
} from "@pp/server-core/tickets/TicketDocs"
import { TicketDocsLive } from "@pp/server-core/tickets/TicketDocsLive"
import { Users } from "@pp/server-core/users/Users"
import { UsersLive } from "@pp/server-core/users/UsersLive"
import {
  ActivityActor,
  CurrentUser,
  ProjectScope,
  TicketId,
  TicketStatus
} from "@pp/shared"
import * as Dispatcher from "@pp/webhooks/Dispatcher"
import * as Endpoints from "@pp/webhooks/Endpoints"
import * as Events from "@pp/webhooks/Events"
import * as ProjectWebhooks from "@pp/webhooks/ProjectWebhooks"
import * as WebhookServices from "@pp/webhooks/Services"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect } from "vitest"

import { WebhookHostLive } from "./HostLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const secretsKey = process.env.USER_SECRET_ENCRYPTION_KEY
const decodeTicketId = Schema.decodeSync(TicketId)
const decodeStatus = Schema.decodeSync(TicketStatus)
const decodeBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
)

type Received = Readonly<{
  path: string
  headers: Readonly<Record<string, string>>
  body: string
}>

describe.skipIf(!databaseUrl)("Outbound webhooks", () => {
  let pool: Pool
  let receiver: ReturnType<typeof Bun.serve>
  const received: Array<Received> = []
  const replies = new Map<string, number>()
  const cleanup: Array<() => Promise<void>> = []

  beforeAll(() => {
    if (!databaseUrl) throw new Error("Isolated database required")
    const url = new URL(databaseUrl)
    if (
      url.hostname !== "127.0.0.1" ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated local database required")
    pool = new Pool({ connectionString: databaseUrl })
    process.env.USER_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    )
    receiver = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname
        received.push({
          path,
          headers: Object.fromEntries(request.headers),
          body: await request.text()
        })
        if (path === "/fenced")
          await pool.query(
            "update webhook_endpoint set lease_token = 'stolen' where lease_token is not null and project_integration_link_id is not null and url_display like '%127.0.0.1%' and id in (select endpoint_id from webhook_delivery where state = 'pending')"
          )
        return new Response("thanks", { status: replies.get(path) ?? 200 })
      }
    })
  })
  afterEach(async () => {
    received.length = 0
    replies.clear()
    for (const run of cleanup.splice(0).reverse()) await run()
  })
  afterAll(async () => {
    void receiver.stop(true)
    await pool.end()
    if (secretsKey === undefined) delete process.env.USER_SECRET_ENCRYPTION_KEY
    else process.env.USER_SECRET_ENCRYPTION_KEY = secretsKey
  })

  const query = <R extends Record<string, unknown>>(
    text: string,
    values: ReadonlyArray<unknown>
  ) =>
    Effect.promise(() => pool.query<R>(text, [...values])).pipe(
      Effect.map((result) => result.rows)
    )

  const fixture = Effect.fnUntraced(function* () {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12)
    const orgId = `hooks-${suffix}`
    const pmId = `pm-${suffix}`
    const devId = `dev-${suffix}`
    const projectId = randomUUID()
    const fs = yield* Effect.service(FileSystem.FileSystem).pipe(
      Effect.provide(BunServices.layer)
    )
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-hooks-" })
    yield* query(
      'insert into "user" (id,name,email,created_at,updated_at) values ($1,$1,$2,now(),now()),($3,$3,$4,now(),now())',
      [pmId, `${pmId}@example.test`, devId, `${devId}@example.test`]
    )
    yield* query(
      "insert into organization (id,name,slug,created_at) values ($1,$1,$1,now())",
      [orgId]
    )
    yield* query(
      "insert into member (id,organization_id,user_id,role,created_at) values ($1,$3,$1,'admin',now()),($2,$3,$2,'member',now())",
      [pmId, devId, orgId]
    )
    yield* query(
      "insert into project_index (id,organization_id,slug,key,name,icon,color,created_by) values ($1,$2,'project','T','Project','folder','#aaaaaa',$3)",
      [projectId, orgId, pmId]
    )
    yield* query(
      "insert into project_member (project_id,organization_id,user_id,role_id) values ($1,$2,$3,'pm'),($1,$2,$4,'developer')",
      [projectId, orgId, pmId, devId]
    )
    yield* query(
      "insert into project_status (project_id,slug,label,icon,color,order_key,created_by) values ($1,'todo','Todo','Circle','#aaaaaa','a0',$2),($1,'doing','Doing','CircleDot','#aaaaaa','a1',$2),($1,'done','Done','CircleCheck','#aaaaaa','a2',$2)",
      [projectId, pmId]
    )
    cleanup.push(async () => {
      await pool.query("delete from organization where id=$1", [orgId])
      await pool.query('delete from "user" where id=any($1)', [[pmId, devId]])
    })
    const layer = WebhookServices.layer.pipe(
      Layer.provideMerge(WebhookHostLive),
      Layer.provideMerge(AccessLive),
      Layer.provideMerge(UsersLive),
      Layer.provideMerge(TicketDocsLive),
      Layer.provideMerge(FinishedStatuses.layer),
      Layer.provideMerge(KeyedLock.layer),
      Layer.provideMerge(TicketActivityLive),
      Layer.provideMerge(MarkdownLive),
      Layer.provideMerge(SecretCryptoLive),
      Layer.provide(
        Layer.mergeAll(
          DbLive.pipe(
            Layer.provideMerge(
              PgClient.layer({
                url: Redacted.make(databaseUrl!),
                types: pgTypes
              })
            )
          ),
          BunServices.layer,
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              PROJECTS_DIR: root,
              BETTER_AUTH_URL: "https://pp.example.test",
              WEBHOOKS_ALLOW_PRIVATE_NETWORKS: "true"
            })
          )
        )
      )
    )
    const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void)
    )
    const context = yield* Layer.buildWithScope(layer, scope)
    const run = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
    ) => Effect.provide(effect, context)
    const [pm] = yield* run(
      Effect.flatMap(Users, (users) => users.fullByIds([pmId]))
    )
    if (!pm) throw new Error("PM missing")
    const projectScope = yield* run(
      Effect.flatMap(Access, (access) => access.project(orgId, "project")).pipe(
        Effect.provideService(CurrentUser, pm)
      )
    )
    const asPm = <A, E>(
      effect: Effect.Effect<A, E, ProjectScope | Layer.Success<typeof layer>>
    ) => run(effect.pipe(Effect.provideService(ProjectScope, projectScope)))
    const hooks = <A, E>(
      use: (
        service: ProjectWebhooks.ProjectWebhooks["Service"]
      ) => Effect.Effect<A, E, ProjectScope>
    ) => asPm(Effect.flatMap(ProjectWebhooks.ProjectWebhooks, use))
    const document: TicketDocument = {
      id: decodeTicketId("T-1"),
      title: "Ship webhooks",
      status: decodeStatus("todo"),
      type: "feat",
      priority: "med",
      tags: [],
      assignees: [],
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      archivedAt: null,
      createdBy: pmId,
      updatedBy: pmId,
      createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-01T00:00:00Z")),
      updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-01T00:00:00Z")),
      body: "",
      commentsRegion: ""
    }
    const createTicket = () =>
      run(
        Effect.flatMap(TicketDocs, (docs) =>
          docs.create(orgId, "project", document)
        )
      )
    const editTicket = (change: Partial<TicketDocument>) =>
      run(
        Effect.flatMap(TicketDocs, (docs) =>
          docs.update(orgId, "project", "T-1", (current) =>
            Effect.succeed({ ...current, ...change })
          )
        ).pipe(Effect.provideService(ActivityActor, ActivityActor.user(pmId)))
      )
    const intake = () =>
      run(Effect.flatMap(Events.WebhookEvents, (events) => events.enqueue()))
    const dispatcher = <A, E>(
      use: (
        service: Dispatcher.WebhookDispatcher["Service"]
      ) => Effect.Effect<A, E>
    ) => run(Effect.flatMap(Dispatcher.WebhookDispatcher, use))
    const drain = () =>
      dispatcher((d) =>
        Effect.flatMap(d.claim(8), (claims) =>
          Effect.forEach(claims, (claim) => d.process(claim), {
            discard: true
          })
        )
      )
    const deliveries = (endpointId: string) =>
      query<{
        id: string
        event: string
        state: string
        attempts: number
        last_outcome: string | null
      }>(
        "select id, event, state, attempts, last_outcome from webhook_delivery where endpoint_id=$1 order by created_at, id",
        [endpointId]
      )
    const endpoint = (endpointId: string) =>
      query<{
        status: string
        failure_count: number
        disabled_reason: string | null
        lease_token: string | null
        link_status: string
      }>(
        "select e.status, e.failure_count, e.disabled_reason, e.lease_token, l.status as link_status from webhook_endpoint e join project_integration_link l on l.id=e.project_integration_link_id where e.id=$1",
        [endpointId]
      ).pipe(Effect.map(([row]) => row!))
    const makeDue = (endpointId: string) =>
      query(
        "update webhook_endpoint set next_attempt_at=now() - interval '1 minute', last_attempt_at=null where id=$1",
        [endpointId]
      )
    const url = (path: string) => `http://127.0.0.1:${receiver.port}${path}`
    return {
      orgId,
      pmId,
      devId,
      hooks,
      createTicket,
      editTicket,
      intake,
      dispatcher,
      drain,
      deliveries,
      endpoint,
      makeDue,
      run,
      url
    }
  })

  it.live("delivers signed ticket events end to end", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const created = yield* f.hooks((h) =>
        h.create({
          url: f.url("/hooks/abcdefghij?token=supersecret1"),
          events: ["ticket_status_changed", "ticket_assignees_changed"],
          headers: [{ name: "Authorization", value: "Bearer token-123456" }]
        })
      )
      expect(created.secret).toMatch(/^whsec_/u)
      expect(created.webhook).toMatchObject({
        url: `http://127.0.0.1:${receiver.port}/…`,
        events: ["ticket_status_changed", "ticket_assignees_changed"],
        headerNames: ["Authorization"],
        status: "active"
      })
      const stored = yield* query<{ url_ciphertext: string }>(
        "select url_ciphertext from webhook_endpoint where id=$1",
        [created.webhook.id]
      )
      expect(stored[0]?.url_ciphertext).not.toContain("supersecret1")

      yield* f.createTicket()
      yield* f.editTicket({ status: decodeStatus("doing") })
      yield* f.editTicket({ assignees: [f.devId] })
      yield* f.intake()
      expect(
        (yield* f.deliveries(created.webhook.id)).map((row) => row.event)
      ).toEqual(["ticket_status_changed", "ticket_assignees_changed"])

      yield* f.drain()
      yield* f.makeDue(created.webhook.id)
      yield* f.drain()

      expect(received.map((request) => request.path)).toEqual([
        "/hooks/abcdefghij",
        "/hooks/abcdefghij"
      ])
      const [first, second] = received
      const rows = yield* f.deliveries(created.webhook.id)
      expect(rows.map((row) => [row.state, row.attempts])).toEqual([
        ["delivered", 1],
        ["delivered", 1]
      ])
      expect(first?.headers).toMatchObject({
        authorization: "Bearer token-123456",
        "x-pp-event": "ticket_status_changed",
        "webhook-id": rows[0]?.id,
        "x-pp-signature-256": `sha256=${createHmac("sha256", created.secret)
          .update(first?.body ?? "")
          .digest("hex")}`
      })
      const timestamp = first?.headers["webhook-timestamp"]
      expect(first?.headers["webhook-signature"]).toBe(
        `v1,${createHmac(
          "sha256",
          Buffer.from(created.secret.slice(6), "base64")
        )
          .update(`${rows[0]?.id}.${timestamp}.${first?.body}`)
          .digest("base64")}`
      )
      expect(decodeBody(first?.body ?? "")).toMatchObject({
        id: rows[0]?.id,
        type: "ticket_status_changed",
        org: { slug: f.orgId },
        project: { slug: "project" },
        actor: { id: f.pmId, name: f.pmId },
        data: {
          ticket: {
            id: "T-1",
            title: "Ship webhooks",
            status: "doing",
            type: "feat",
            url: `https://pp.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`
          },
          previousStatus: "todo"
        }
      })
      expect(decodeBody(second?.body ?? "")).toMatchObject({
        type: "ticket_assignees_changed",
        data: { assignees: [f.devId], added: [f.devId], removed: [] }
      })
      expect(yield* f.hooks((h) => h.list())).toEqual([
        expect.objectContaining({ id: created.webhook.id, failureCount: 0 })
      ])
    })
  )

  it.live("backs off a failing endpoint and keeps the event pending", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/flaky"), events: ["ticket_status_changed"] })
      )
      replies.set("/flaky", 503)
      yield* f.createTicket()
      yield* f.editTicket({ status: decodeStatus("doing") })
      yield* f.intake()
      yield* f.drain()
      yield* f.drain()
      expect(received).toHaveLength(1)
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({
          state: "pending",
          attempts: 1,
          last_outcome: "http_503"
        })
      ])
      expect(yield* f.endpoint(webhook.id)).toMatchObject({
        failure_count: 1,
        lease_token: null
      })

      replies.delete("/flaky")
      yield* f.makeDue(webhook.id)
      yield* f.drain()
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "delivered", attempts: 2 })
      ])
      expect(yield* f.endpoint(webhook.id)).toMatchObject({ failure_count: 0 })
    })
  )

  it.live(
    "disables an endpoint after three 410s and stops capturing until re-enabled",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const { webhook } = yield* f.hooks((h) =>
          h.create({ url: f.url("/gone"), events: ["ticket_status_changed"] })
        )
        replies.set("/gone", 410)
        yield* f.createTicket()
        for (const status of ["doing", "done", "todo"])
          yield* f.editTicket({ status: decodeStatus(status) })
        yield* f.intake()
        for (let attempt = 0; attempt < 3; attempt++) {
          yield* f.makeDue(webhook.id)
          yield* f.drain()
        }
        expect(yield* f.endpoint(webhook.id)).toMatchObject({
          status: "disabled",
          disabled_reason: "gone",
          link_status: "broken"
        })
        expect(
          (yield* f.deliveries(webhook.id)).map((row) => row.state)
        ).toEqual(["failed", "failed", "failed"])

        yield* f.editTicket({ status: decodeStatus("doing") })
        yield* f.intake()
        expect(yield* f.deliveries(webhook.id)).toHaveLength(3)

        const moved = yield* f.hooks((h) =>
          h.update(webhook.id, { url: f.url("/moved") })
        )
        expect(moved).toMatchObject({ status: "disabled", failureCount: 0 })

        const enabled = yield* f.hooks((h) => h.enable(webhook.id))
        expect(enabled).toMatchObject({ status: "active", failureCount: 0 })
        expect(yield* f.endpoint(webhook.id)).toMatchObject({
          link_status: "active"
        })
        yield* f.editTicket({ status: decodeStatus("done") })
        yield* f.intake()
        expect(yield* f.deliveries(webhook.id)).toHaveLength(4)
      })
  )

  it.live("lets a PM pause a webhook without losing its history", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/paused"), events: ["ticket_status_changed"] })
      )
      yield* f.createTicket()
      yield* f.editTicket({ status: decodeStatus("doing") })
      yield* f.intake()
      yield* f.drain()
      const paused = yield* f.hooks((h) => h.disable(webhook.id))
      expect(paused).toMatchObject({
        status: "disabled",
        disabledReason: "manual"
      })
      expect(yield* f.endpoint(webhook.id)).toMatchObject({
        link_status: "broken"
      })
      yield* f.editTicket({ status: decodeStatus("done") })
      yield* f.intake()
      yield* f.drain()
      expect(received).toHaveLength(1)
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "delivered" })
      ])
    })
  )

  it.live("resets the failure streak when a PM retries", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({
          url: f.url("/moved-away"),
          events: ["ticket_status_changed"]
        })
      )
      replies.set("/moved-away", 410)
      yield* f.createTicket()
      for (const status of ["doing", "done"])
        yield* f.editTicket({ status: decodeStatus(status) })
      yield* f.intake()
      for (let attempt = 0; attempt < 2; attempt++) {
        yield* f.makeDue(webhook.id)
        yield* f.drain()
      }
      const [first] = yield* f.deliveries(webhook.id)
      yield* f.hooks((h) => h.retryDelivery(webhook.id, first!.id))
      expect(yield* f.endpoint(webhook.id)).toMatchObject({
        status: "active",
        failure_count: 0
      })
      yield* f.makeDue(webhook.id)
      yield* f.drain()
      expect(yield* f.endpoint(webhook.id)).toMatchObject({
        status: "active",
        failure_count: 1
      })
    })
  )

  it.live("keeps expired deliveries from pushing out delivered history", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/history"), events: ["ticket_created"] })
      )
      yield* query(
        "insert into webhook_delivery (id, endpoint_id, event, body, kind, state, created_at, finished_at) select 'done-' || n, $1, 'ticket_created', '{}', 'event', 'delivered', now() - interval '2 days' - n * interval '1 minute', now() from generate_series(1, 3) n",
        [webhook.id]
      )
      yield* query(
        "insert into webhook_delivery (id, endpoint_id, event, body, kind, state, created_at) select 'late-' || n, $1, 'ticket_created', '{}', 'event', 'pending', now() - interval '25 hours' - n * interval '1 second' from generate_series(1, 60) n",
        [webhook.id]
      )
      yield* f.dispatcher((d) => d.expire())
      const states = (yield* f.deliveries(webhook.id)).map((row) => row.state)
      expect(states.filter((state) => state === "delivered")).toHaveLength(3)
      expect(states.filter((state) => state === "expired")).toHaveLength(20)
    })
  )

  it.live("does not send after a PM disables a claimed webhook", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/stopped"), events: ["ticket_status_changed"] })
      )
      yield* f.createTicket()
      yield* f.editTicket({ status: decodeStatus("doing") })
      yield* f.intake()
      const claims = yield* f.dispatcher((d) => d.claim(8))
      yield* f.hooks((h) => h.disable(webhook.id))
      yield* f.dispatcher((d) => d.process(claims[0]!))
      expect(received).toEqual([])
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "pending", attempts: 0 })
      ])
    })
  )

  it.live("writes nothing when the lease is lost while sending", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/fenced"), events: ["ticket_status_changed"] })
      )
      yield* f.createTicket()
      yield* f.editTicket({ status: decodeStatus("doing") })
      yield* f.intake()
      yield* f.drain()
      expect(received).toHaveLength(1)
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "pending", attempts: 0 })
      ])
      expect(yield* f.endpoint(webhook.id)).toMatchObject({
        lease_token: "stolen",
        failure_count: 0
      })
    })
  )

  it.live("sends test pings and retries failed deliveries on request", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/ping"), events: ["ticket_created"] })
      )
      replies.set("/ping", 400)
      const ping = yield* f.hooks((h) => h.test(webhook.id))
      expect(ping).toMatchObject({
        event: "ping",
        kind: "test",
        state: "pending"
      })
      yield* f.drain()
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "failed", last_outcome: "http_400" })
      ])

      replies.delete("/ping")
      const retried = yield* f.hooks((h) =>
        h.retryDelivery(webhook.id, ping.id)
      )
      expect(retried.state).toBe("pending")
      yield* f.makeDue(webhook.id)
      yield* f.drain()
      const listed = yield* f.hooks((h) => h.deliveries(webhook.id))
      expect(listed).toEqual([
        expect.objectContaining({
          id: ping.id,
          state: "delivered",
          attempts: 2
        })
      ])
      expect(decodeBody(received.at(-1)?.body ?? "")).toMatchObject({
        type: "ping",
        data: {}
      })

      yield* query(
        "insert into webhook_delivery (id, endpoint_id, event, body, kind, state, last_outcome, created_at, finished_at) values ('huge', $1, 'ticket_created', '{}', 'event', 'failed', 'body_too_large', now(), now())",
        [webhook.id]
      )
      const tooLarge = yield* f
        .hooks((h) => h.retryDelivery(webhook.id, "huge"))
        .pipe(Effect.flip)
      expect(tooLarge).toMatchObject({
        _tag: "Conflict",
        reason: "webhook_delivery_too_large"
      })

      const delivered = yield* f
        .hooks((h) => h.retryDelivery(webhook.id, ping.id))
        .pipe(Effect.flip)
      expect(delivered).toMatchObject({
        _tag: "Conflict",
        reason: "webhook_delivery_delivered"
      })
    })
  )

  it.live("stops sending once the organization is deleted", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/deleted-org"), events: ["ticket_created"] })
      )
      yield* f.hooks((h) => h.test(webhook.id))
      yield* query("update organization set deleted_at = now() where id = $1", [
        f.orgId
      ])
      expect(yield* f.dispatcher((d) => d.claim(8))).toEqual([])
      expect(received).toEqual([])
    })
  )

  it.live(
    "keeps oversized deliveries within retention, without their body",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const { webhook } = yield* f.hooks((h) =>
          h.create({ url: f.url("/huge"), events: ["ticket_created"] })
        )
        const body = "x".repeat(1024 * 1024 + 1)
        yield* f.run(
          Effect.flatMap(Endpoints.WebhookEndpoints, (endpoints) =>
            Effect.forEach(
              Array.from({ length: 55 }, (_, n) => n),
              (n) =>
                endpoints.enqueue({
                  id: `huge-${n}`,
                  endpointId: webhook.id,
                  event: "ticket_created",
                  body,
                  kind: "event",
                  createdAt: DateTime.toDate(
                    DateTime.makeUnsafe(Date.UTC(2026, 10, 1, 0, n))
                  )
                }),
              { discard: true }
            )
          )
        )
        const [stats] = yield* query<{ rows: number; bytes: number }>(
          "select count(*)::int as rows, coalesce(sum(length(body)), 0)::int as bytes from webhook_delivery where endpoint_id = $1",
          [webhook.id]
        )
        expect(stats).toEqual({ rows: 50, bytes: 0 })
      })
  )

  it.live("expires deliveries older than a day without sending them", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const { webhook } = yield* f.hooks((h) =>
        h.create({ url: f.url("/late"), events: ["ticket_created"] })
      )
      yield* f.hooks((h) => h.test(webhook.id))
      yield* query(
        "update webhook_delivery set created_at = now() - interval '25 hours' where endpoint_id=$1",
        [webhook.id]
      )
      expect(yield* f.dispatcher((d) => d.claim(8))).toEqual([])
      yield* f.dispatcher((d) => d.expire())
      expect(yield* f.deliveries(webhook.id)).toEqual([
        expect.objectContaining({ state: "expired", attempts: 0 })
      ])
      expect(received).toEqual([])
    })
  )

  it.live(
    "rejects reserved headers and keeps other projects' webhooks apart",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const rejected = yield* f
          .hooks((h) =>
            h.create({
              url: f.url("/x"),
              events: ["ticket_created"],
              headers: [{ name: "X-PP-Signature-256", value: "forged" }]
            })
          )
          .pipe(Effect.flip)
        expect(rejected).toMatchObject({
          _tag: "Validation",
          reason: "webhook_header_reserved"
        })
        const other = yield* fixture()
        const { webhook } = yield* other.hooks((h) =>
          h.create({ url: other.url("/y"), events: ["ticket_created"] })
        )
        const missing = yield* f
          .hooks((h) => h.deliveries(webhook.id))
          .pipe(Effect.flip)
        expect(missing).toMatchObject({ _tag: "NotFound" })
      })
  )
})
