// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, pgTypes } from "@pp/db"
import { SlackClient } from "@pp/integration-slack/Client"
import {
  SlackDelivery,
  SlackDeliveryWorkflow,
  SlackDeliveryWorkflowLive
} from "@pp/integration-slack/Delivery"
import { SlackEvents } from "@pp/integration-slack/Events"
import { SlackIntegrations } from "@pp/integration-slack/Integrations"
import { SlackPreviews } from "@pp/integration-slack/Previews"
import { Access } from "@pp/server-core/access/Access"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { TicketActivity } from "@pp/server-core/activity/TicketActivity"
import { TicketActivityLive } from "@pp/server-core/activity/TicketActivityLive"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { GroupDocsLive } from "@pp/server-core/groups/GroupDocsLive"
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
  GroupDetail,
  CurrentUser,
  OrgScope,
  ProjectScope,
  TicketId,
  TicketStatus
} from "@pp/shared"
import { ClusterWorkflowEngine, SingleRunner } from "effect/cluster"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect } from "vitest"

import { SlackHostLive } from "./HostLive"

const decodeUnknownStringSync = Schema.decodeUnknownSync(Schema.String)

const decodeGroupDetailSync = Schema.decodeSync(GroupDetail)

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const openServices = Effect.fnUntraced(function* <R, E>(
  layer: Layer.Layer<R, E>
) {
  const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
    Scope.close(scope, Exit.void)
  )
  const context = yield* Layer.buildWithScope(layer, scope)
  return { scope, context }
})

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const secretsKey = process.env.USER_SECRET_ENCRYPTION_KEY
const decodeBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
)
const decodeTicketId = Schema.decodeSync(TicketId)
const decodeStatus = Schema.decodeSync(TicketStatus)

describe.skipIf(!databaseUrl)("Slack integration", () => {
  let pool: Pool
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
    process.env.USER_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    )
  })
  afterEach(async () => {
    for (const run of cleanup.splice(0).reverse()) await run()
  })
  afterAll(async () => {
    await pool.end()
    if (secretsKey === undefined) delete process.env.USER_SECRET_ENCRYPTION_KEY
    else process.env.USER_SECRET_ENCRYPTION_KEY = secretsKey
  })

  const fixture = Effect.fnUntraced(function* () {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12)
    const orgId = `slack-${suffix}`
    const adminId = `admin-${suffix}`
    const userId = `sharer-${suffix}`
    const projectId = randomUUID()
    const fs = yield* Effect.service(FileSystem.FileSystem).pipe(
      Effect.provide(BunServices.layer)
    )
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pp-slack-" })
    yield* Effect.promise(() =>
      pool.query(
        'insert into "user" (id,name,email,created_at,updated_at) values ($1,$1,$2,now(),now()),($3,$3,$4,now(),now())',
        [adminId, `${adminId}@example.test`, userId, `${userId}@example.test`]
      )
    )
    yield* Effect.promise(() =>
      pool.query(
        "insert into organization (id,name,slug,created_at) values ($1,$1,$1,now())",
        [orgId]
      )
    )
    yield* Effect.promise(() =>
      pool.query(
        "insert into member (id,organization_id,user_id,role,created_at) values ($1,$3,$1,'admin',now()),($2,$3,$2,'member',now())",
        [adminId, userId, orgId]
      )
    )
    yield* Effect.promise(() =>
      pool.query(
        "insert into project_index (id,organization_id,slug,key,name,icon,color,created_by) values ($1,$2,'project','T','Project','folder','#aaaaaa',$3)",
        [projectId, orgId, adminId]
      )
    )
    yield* Effect.promise(() =>
      pool.query(
        "insert into project_member (project_id,organization_id,user_id,role_id) values ($1,$2,$3,'pm'),($1,$2,$4,'developer')",
        [projectId, orgId, adminId, userId]
      )
    )
    yield* Effect.promise(() =>
      pool.query(
        "insert into project_status (project_id,slug,label,icon,color,order_key,created_by) values ($1,'todo','Todo','Circle','#aaaaaa','a0',$2),($1,'done','Done','CircleCheck','#aaaaaa','a1',$2)",
        [projectId, adminId]
      )
    )
    cleanup.push(async () => {
      await pool.query("delete from organization where id=$1", [orgId])
      await pool.query('delete from "user" where id=any($1)', [
        [adminId, userId]
      ])
    })
    const calls: Array<
      Readonly<{ method: string; body: Readonly<Record<string, unknown>> }>
    > = []
    const response = {
      teamId: `T${suffix.toUpperCase()}`,
      slackUserId: "USHARER",
      sendMode: "ok",
      socketUrl: "wss://slack.example.test/socket?app_id=APPBOT"
    }
    const fetch: typeof globalThis.fetch = Object.assign(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1]
      ) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        )
        const method = url.pathname.split("/").at(-1) ?? ""
        const encoded = typeof init?.body === "string" ? init.body : "{}"
        const body =
          init?.headers &&
          new Headers(init.headers).get("content-type") ===
            "application/x-www-form-urlencoded"
            ? Object.fromEntries(new URLSearchParams(encoded))
            : decodeBody(encoded)
        calls.push({ method, body })
        const channel = {
          id: "CNOTIFY",
          name: "project",
          is_member: true,
          is_archived: false
        }
        if (method === "auth.test")
          return Response.json({
            ok: true,
            team_id: response.teamId,
            team: "Workspace",
            user_id: "UBOT",
            bot_id: "BBOT"
          })
        if (method === "bots.info")
          return Response.json({ ok: true, bot: { app_id: "APPBOT" } })
        if (method === "apps.connections.open")
          return Response.json({ ok: true, url: response.socketUrl })
        if (method === "conversations.info")
          return Response.json({ ok: true, channel })
        if (method === "conversations.list")
          return Response.json({
            ok: true,
            channels: [
              channel,
              { ...channel, id: "COTHER", name: "not-joined", is_member: false }
            ],
            response_metadata: { next_cursor: "" }
          })
        if (method === "openid.connect.token")
          return Response.json({ ok: true, access_token: "identity-token" })
        if (method === "openid.connect.userInfo")
          return Response.json({
            ok: true,
            sub: response.slackUserId,
            "https://slack.com/user_id": response.slackUserId,
            "https://slack.com/team_id": response.teamId,
            name: "Sharer"
          })
        if (method === "chat.postMessage" && response.sendMode === "limited")
          return Response.json(
            { ok: false },
            { status: 429, headers: { "retry-after": "2" } }
          )
        if (method === "chat.postMessage" && response.sendMode === "offline")
          throw new Error("network unavailable")
        if (["chat.postMessage", "chat.unfurl"].includes(method))
          return Response.json({ ok: true })
        return Response.json({ ok: false, error: "unexpected_method" })
      },
      { preconnect: () => {} }
    )
    const engine = ClusterWorkflowEngine.layer.pipe(
      Layer.provide(SingleRunner.layer({ runnerStorage: "sql" }))
    )
    const services = SlackPreviews.layer.pipe(
      Layer.provideMerge(SlackDelivery.layer),
      Layer.provideMerge(SlackEvents.layer),
      Layer.provideMerge(SlackIntegrations.layer),
      Layer.provideMerge(SlackClient.layer),
      Layer.provideMerge(SlackHostLive),
      Layer.provideMerge(AccessLive),
      Layer.provideMerge(UsersLive),
      Layer.provideMerge(GroupDocsLive),
      Layer.provideMerge(TicketDocsLive),
      Layer.provideMerge(FinishedStatuses.layer),
      Layer.provideMerge(KeyedLock.layer),
      Layer.provideMerge(TicketActivityLive),
      Layer.provideMerge(MarkdownLive),
      Layer.provideMerge(SecretCryptoLive)
    )
    const infrastructure = Layer.mergeAll(
      DbLive.pipe(
        Layer.provideMerge(
          PgClient.layer({ url: Redacted.make(databaseUrl!), types: pgTypes })
        )
      ),
      BunServices.layer,
      Layer.succeed(FetchHttpClient.Fetch, fetch),
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          PROJECTS_DIR: root,
          BETTER_AUTH_URL: "https://pp.example.test"
        })
      )
    )
    const startServices = () =>
      openServices(services.pipe(Layer.provide(infrastructure)))
    const startWorkflow = () =>
      openServices(
        SlackDeliveryWorkflowLive.pipe(
          Layer.provideMerge(services),
          Layer.provideMerge(engine),
          Layer.provide(infrastructure)
        )
      )
    const instance = yield* startServices()
    const [admin, sharer] = yield* Effect.provide(
      Effect.flatMap(Users, (users) => users.fullByIds([adminId, userId])),
      instance.context
    )
    const administrator = admin?.id === adminId ? admin : sharer
    if (!administrator) throw new Error("Admin missing")
    const orgScope = yield* Effect.provide(
      Effect.flatMap(Access, (access) => access.org(orgId)).pipe(
        Effect.provideService(CurrentUser, administrator)
      ),
      instance.context
    )
    const projectScope = yield* Effect.provide(
      Effect.flatMap(Access, (access) => access.project(orgId, "project")).pipe(
        Effect.provideService(CurrentUser, administrator)
      ),
      instance.context
    )
    const asOrg = <A, E>(
      effect: Effect.Effect<A, E, OrgScope | SlackIntegrations>
    ) =>
      Effect.provide(
        effect.pipe(Effect.provideService(OrgScope, orgScope)),
        instance.context
      )
    const asProject = <A, E>(
      effect: Effect.Effect<A, E, ProjectScope | SlackIntegrations>
    ) =>
      Effect.provide(
        effect.pipe(Effect.provideService(ProjectScope, projectScope)),
        instance.context
      )
    yield* asOrg(
      Effect.flatMap(SlackIntegrations, (slack) =>
        slack.connectOrg({
          botToken: "xoxb-test",
          appToken: "xapp-test",
          clientId: "123.456",
          clientSecret: "client-secret"
        })
      )
    )
    yield* asProject(
      Effect.flatMap(SlackIntegrations, (slack) =>
        slack.saveProject({
          channelId: "CNOTIFY",
          events: [
            "ticket_created",
            "ticket_completed",
            "ticket_reopened",
            "sprint_started",
            "sprint_completed"
          ]
        })
      )
    )
    const document: TicketDocument = {
      id: decodeTicketId("T-1"),
      title: "Fix <!channel>",
      status: decodeStatus("todo"),
      type: "bug",
      priority: "med",
      tags: [],
      assignees: [userId],
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      archivedAt: null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-10-19T00:00:00Z")),
      updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-10-19T00:00:00Z")),
      body: "Private description must not be published",
      commentsRegion: ""
    }
    const create = () =>
      Effect.provide(
        Effect.flatMap(TicketDocs, (docs) =>
          docs.create(orgId, "project", document)
        ),
        instance.context
      )
    const begin = () =>
      Effect.provide(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.beginOAuth(userId, orgId, "browser-session")
        ),
        instance.context
      )
    const complete = (url: string, binding = "browser-session") =>
      Effect.provide(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.completeOAuth(
            userId,
            "code",
            new URL(url).searchParams.get("state")!,
            binding
          )
        ),
        instance.context
      )
    const preview = ({
      source,
      url,
      urls
    }: Readonly<{
      source?: "composer"
      url?: string
      urls?: ReadonlyArray<string>
    }> = {}) =>
      Effect.provide(
        Effect.flatMap(SlackPreviews, (previews) =>
          previews.handle(orgId, {
            team_id: response.teamId,
            api_app_id: "APPBOT",
            event: {
              type: "link_shared",
              user: "USHARER",
              channel: "CUNRELATED",
              message_ts: "123.456",
              ...(source ? { unfurl_id: "composer-preview", source } : {}),
              links: (
                urls ?? [
                  url ??
                    `https://pp.example.test/orgs/${orgId}/projects/project/tickets/T-1`
                ]
              ).map((url) => ({ url }))
            }
          })
        ),
        instance.context
      )
    return {
      instance,
      startServices,
      startWorkflow,
      fs,
      root,
      orgId,
      userId,
      projectId,
      calls,
      response,
      create,
      begin,
      complete,
      preview,
      asOrg,
      asProject,
      suffix,
      enqueue: () =>
        Effect.provide(
          Effect.flatMap(SlackEvents, (events) => events.enqueue()),
          instance.context
        )
    }
  })

  it.effect(
    "saves tickets while Slack is offline and recovers the file-to-job handoff after a new instance starts",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        f.response.sendMode = "offline"
        const trigger = `slack_fail_${f.suffix}`
        yield* Effect.promise(() =>
          pool.query(
            `create function ${trigger}() returns trigger language plpgsql as $$ begin raise exception 'injected handoff failure'; end $$`
          )
        )
        yield* Effect.promise(() =>
          pool.query(
            `create trigger ${trigger} before insert on project_integration_event for each row execute function ${trigger}()`
          )
        )
        cleanup.push(async () => {
          await pool.query(
            `drop trigger if exists ${trigger} on project_integration_event`
          )
          await pool.query(`drop function if exists ${trigger}()`)
        })
        const created = yield* Deferred.make<void>()
        const creation = yield* Effect.forkChild(
          f.create().pipe(Effect.ensuring(Deferred.succeed(created, undefined)))
        )
        while (!(yield* Deferred.isDone(created))) {
          yield* TestClock.adjust("50 millis")
        }
        yield* Fiber.join(creation)
        expect(
          f.calls.filter((call) => call.method === "chat.postMessage")
        ).toHaveLength(0)
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select batch_id from ticket_activity_outbox where project_id=$1",
              [f.projectId]
            )
          )).rowCount
        ).toBe(1)
        yield* Scope.close(f.instance.scope, Exit.void)
        yield* Effect.promise(() =>
          pool.query(`drop trigger ${trigger} on project_integration_event`)
        )
        const restarted = yield* f.startServices()
        yield* Effect.provide(
          Effect.flatMap(TicketActivity, (activity) => activity.recover()),
          restarted.context
        )
        const pending = yield* Effect.promise(() =>
          pool.query(
            "select e.id from project_integration_event e join project_integration_link l on l.id=e.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        expect(pending.rowCount).toBe(1)
        yield* Effect.promise(() =>
          pool.query(
            `create trigger ${trigger} before insert on slack_notification for each row execute function ${trigger}()`
          )
        )
        cleanup.push(() =>
          pool
            .query(`drop trigger if exists ${trigger} on slack_notification`)
            .then(() => undefined)
        )
        expect(
          yield* Effect.exit(
            Effect.provide(
              Effect.flatMap(SlackEvents, (events) => events.enqueue()),
              restarted.context
            )
          )
        ).toMatchObject({ _tag: "Failure" })
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select consumed_at from project_integration_event where id=$1",
              [pending.rows[0].id]
            )
          )).rows[0].consumed_at
        ).toBeNull()
        yield* Effect.promise(() =>
          pool.query(`drop trigger ${trigger} on slack_notification`)
        )
        yield* Scope.close(restarted.scope, Exit.void)
        const dispatcher = yield* f.startServices()
        yield* Effect.provide(
          Effect.flatMap(SlackEvents, (events) => events.enqueue()),
          dispatcher.context
        )
        yield* Effect.provide(
          Effect.flatMap(SlackEvents, (events) => events.enqueue()),
          dispatcher.context
        )
        const jobs = yield* Effect.promise(() =>
          pool.query(
            "select payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        expect(jobs.rows.map((row) => row.payload.kind)).toEqual([
          "ticket_created"
        ])
        yield* Effect.provide(
          Effect.flatMap(TicketActivity, (activity) => activity.recover()),
          dispatcher.context
        )
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select batch_id from ticket_activity_outbox where project_id=$1",
              [f.projectId]
            )
          )).rowCount
        ).toBe(0)
      }),
    20_000
  )

  it.effect(
    "checks OAuth state, browser binding, workspace identity and replay before linking an account",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const started = yield* f.begin()
        expect(
          yield* Effect.flip(f.complete(started, "another-browser"))
        ).toMatchObject({
          _tag: "SlackAuthInvalid"
        })
        const team = f.response.teamId
        f.response.teamId = "TWRONG"
        expect(yield* Effect.flip(f.complete(started))).toMatchObject({
          _tag: "SlackAuthInvalid"
        })
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select user_id from user_slack_integration where user_id=$1",
              [f.userId]
            )
          )).rowCount
        ).toBe(0)
        f.response.teamId = team
        const retry = yield* f.begin()
        yield* f.complete(retry)
        expect(yield* Effect.flip(f.complete(retry))).toMatchObject({
          _tag: "SlackAuthInvalid"
        })
        const profile = yield* Effect.provide(
          Effect.flatMap(SlackIntegrations, (slack) =>
            slack.profiles(f.userId)
          ),
          f.instance.context
        )
        expect(profile[0]?.slackUserId).toBe("USHARER")
        const stored = yield* Effect.promise(() =>
          pool.query(
            "select ciphertext from organization_slack_integration where team_id=$1",
            [team]
          )
        )
        expect(stored.rows[0]?.ciphertext).not.toContain("xoxb-test")
        expect(stored.rows[0]?.ciphertext).not.toContain("client-secret")
      })
  )

  it.effect("preserves a connection conflict as a typed error", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      f.response.teamId = "TANOTHER"
      const result = yield* f.asOrg(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.connectOrg({
            botToken: "xoxb-test",
            appToken: "xapp-test",
            clientId: "123.456",
            clientSecret: "client-secret"
          })
        ).pipe(Effect.result)
      )
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "Conflict", reason: "slack_disconnect_first" }
      })
    })
  )

  it.effect(
    "rejects an app-level token that belongs to a different Slack app",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        f.response.socketUrl = "wss://slack.example.test/socket?app_id=AOTHER"
        const result = yield* f.asOrg(
          Effect.flatMap(SlackIntegrations, (slack) =>
            slack.connectOrg({
              botToken: "xoxb-other",
              appToken: "xapp-other",
              clientId: "123.456",
              clientSecret: "client-secret"
            })
          ).pipe(Effect.result)
        )
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "SlackError", reason: "app_mismatch" }
        })
      })
  )

  it.live(
    "retries delivery after a transient database failure while recording success",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        yield* f.create()
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query<{ id: string }>(
            "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        const id = decodeUnknownStringSync(jobs.rows[0]?.id)
        const trigger = `slack_retry_${f.suffix}`
        yield* Effect.promise(() => pool.query(`create sequence ${trigger}`))
        yield* Effect.promise(() =>
          pool.query(`create function ${trigger}() returns trigger language plpgsql as $$
      begin
        if new.id = TG_ARGV[0] and new.finished_at is not null and nextval('${trigger}') = 1 then
          raise exception 'transient database failure' using errcode = '40001';
        end if;
        return new;
      end $$`)
        )
        yield* Effect.promise(() =>
          pool.query(
            `create trigger ${trigger} before update on slack_notification for each row execute function ${trigger}('${id}')`
          )
        )
        cleanup.push(async () => {
          await pool.query(
            `drop trigger if exists ${trigger} on slack_notification`
          )
          await pool.query(`drop function if exists ${trigger}()`)
          await pool.query(`drop sequence if exists ${trigger}`)
        })
        const instance = yield* f.startWorkflow()
        yield* Effect.provide(
          SlackDeliveryWorkflow.execute({ id }),
          instance.context
        )
        const sent = f.calls.filter(
          (call) => call.method === "chat.postMessage"
        )
        expect(sent.map((call) => call.body.client_msg_id)).toEqual([id, id])
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select finished_at,error from slack_notification where id=$1",
              [id]
            )
          )).rows[0]
        ).toMatchObject({
          finished_at: expect.any(Date),
          error: null
        })
      }),
    20_000
  )

  it.effect(
    "privately prompts an unlinked sharer, then previews only with current ticket access",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        yield* f.create()
        for (const url of [
          `https://another.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`,
          "https://pp.example.test/orgs/another-org/projects/project/tickets/T-1",
          `https://pp.example.test/orgs/${f.orgId}/projects/project`
        ])
          yield* f.preview({ url })
        expect(
          f.calls.filter((call) => call.method === "chat.unfurl")
        ).toHaveLength(0)
        yield* f.preview()
        const prompts = f.calls.filter((call) => call.method === "chat.unfurl")
        expect(prompts).toHaveLength(1)
        expect(prompts[0]?.body).toMatchObject({
          channel: "CUNRELATED",
          ts: "123.456",
          user_auth_message: expect.stringContaining(
            `<https://pp.example.test/api/integrations/slack/oauth/start?orgSlug=${f.orgId}|Connect PP to show previews>`
          )
        })
        expect(prompts[0]?.body).not.toHaveProperty("unfurls")
        expect(encodeJson(prompts[0]?.body)).not.toContain("Fix <!channel>")
        expect(encodeJson(prompts[0]?.body)).not.toContain(
          "Private description"
        )
        f.calls.length = 0
        yield* f.preview({ source: "composer" })
        expect(
          f.calls.find((call) => call.method === "chat.unfurl")?.body
        ).toMatchObject({
          unfurl_id: "composer-preview",
          source: "composer",
          user_auth_message: expect.stringContaining(
            "Connect PP to show previews"
          )
        })
        expect(
          f.calls.find((call) => call.method === "chat.unfurl")?.body
        ).not.toHaveProperty("channel")
        f.calls.length = 0
        yield* f.complete(yield* f.begin())
        const ticketUrl = `https://pp.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`
        yield* f.preview({ urls: [ticketUrl, `${ticketUrl}?share=2`] })
        const previews = f.calls.filter((call) => call.method === "chat.unfurl")
        expect(previews).toHaveLength(1)
        expect(previews[0]?.body.channel).toBe("CUNRELATED")
        expect(Object.keys(previews[0]?.body.unfurls ?? {})).toHaveLength(2)
        expect(encodeJson(previews[0]?.body)).toContain("Fix <!channel>")
        expect(previews[0]?.body.unfurls).toMatchObject({
          [`https://pp.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`]:
            {
              blocks: expect.arrayContaining([
                {
                  type: "section",
                  text: { type: "plain_text", text: "T-1 · Fix <!channel>" }
                }
              ])
            }
        })
        expect(encodeJson(previews[0]?.body)).not.toContain(
          "Private description"
        )
        yield* Effect.promise(() =>
          pool.query(
            "delete from project_member where project_id=$1 and user_id=$2",
            [f.projectId, f.userId]
          )
        )
        yield* f.preview()
        expect(
          f.calls.filter((call) => call.method === "chat.unfurl")
        ).toHaveLength(1)
      })
  )

  it.live(
    "survives a SQL workflow restart while waiting to retry Slack's rate limit",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        yield* f.create()
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query(
            "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        const id = decodeUnknownStringSync(jobs.rows[0]?.id)
        f.response.sendMode = "limited"
        const first = yield* f.startWorkflow()
        yield* Effect.provide(
          SlackDeliveryWorkflow.execute({ id }, { discard: true }),
          first.context
        )
        yield* Effect.promise(async () => {
          await expect
            .poll(
              () =>
                f.calls.filter((call) => call.method === "chat.postMessage")
                  .length,
              { timeout: 10_000 }
            )
            .toBe(1)
        })
        yield* Scope.close(first.scope, Exit.void)
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select finished_at from slack_notification where id=$1",
              [id]
            )
          )).rows[0]?.finished_at
        ).toBeNull()
        f.response.sendMode = "ok"
        const restarted = yield* f.startWorkflow()
        yield* Effect.provide(
          SlackDeliveryWorkflow.execute({ id }),
          restarted.context
        )
        const sent = f.calls.filter(
          (call) => call.method === "chat.postMessage"
        )
        expect(sent).toHaveLength(2)
        expect(sent.map((call) => call.body.client_msg_id)).toEqual([id, id])
        expect(sent[1]?.body.text).toContain("Fix &lt;!channel&gt;")
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select finished_at,error from slack_notification where id=$1",
              [id]
            )
          )).rows[0]
        ).toMatchObject({ error: null, finished_at: expect.any(Date) })
        yield* Effect.provide(
          SlackDeliveryWorkflow.execute({ id }),
          restarted.context
        )
        expect(
          f.calls.filter((call) => call.method === "chat.postMessage")
        ).toHaveLength(2)
      }),
    30_000
  )

  it.effect(
    "records subscribed events for each integration and lets Slack consume only its own",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const parentId = randomUUID()
        const linkId = randomUUID()
        yield* Effect.promise(() =>
          pool.query(
            "insert into organization_integration (id,organization_id,provider,status) values ($1,$2,'figma','active')",
            [parentId, f.orgId]
          )
        )
        yield* Effect.promise(() =>
          pool.query(
            `insert into project_integration_link (id,project_id,organization_id,organization_integration_id,provider,status,subscribed_events)
       values ($1,$2,$3,$4,'figma','active','["ticket_created"]')`,
            [linkId, f.projectId, f.orgId, parentId]
          )
        )
        yield* f.create()
        const pending = yield* Effect.promise(() =>
          pool.query<Readonly<{ id: string }>>(
            "select id from project_integration_event where project_integration_link_id=$1",
            [linkId]
          )
        )
        expect(pending.rowCount).toBe(1)
        yield* f.enqueue()
        yield* f.enqueue()
        expect(
          (yield* Effect.promise(() =>
            pool.query(
              "select consumed_at from project_integration_event where id=$1",
              [pending.rows[0].id]
            )
          )).rows[0].consumed_at
        ).toBeNull()
        const jobs = yield* Effect.promise(() =>
          pool.query<Readonly<{ payload: Readonly<{ kind: string }> }>>(
            "select n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        expect(jobs.rows.map((row) => row.payload.kind)).toEqual([
          "ticket_created"
        ])
      })
  )

  it.effect("records only selected ticket transitions", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* f.asProject(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.saveProject({
            channelId: "CNOTIFY",
            events: ["ticket_completed"]
          })
        )
      )
      yield* f.create()
      for (const status of ["done", "todo"]) {
        yield* Effect.provide(
          Effect.flatMap(TicketDocs, (docs) =>
            docs.update(f.orgId, "project", "T-1", (current) =>
              Effect.succeed({ ...current, status: decodeStatus(status) })
            )
          ).pipe(
            Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
          ),
          f.instance.context
        )
      }
      yield* f.enqueue()
      const jobs = yield* Effect.promise(() =>
        pool.query<{ payload: { kind: string } }>(
          "select n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
          [f.projectId]
        )
      )
      expect(jobs.rows.map((row) => row.payload.kind)).toEqual([
        "ticket_completed"
      ])
    })
  )

  it.live(
    "schedules sprint starts locally and discards a start after the sprint is rescheduled",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        const startsAt = "2030-01-01T09:00:00.000Z"
        const document = decodeGroupDetailSync({
          id: "G-1",
          name: "Sprint one",
          kind: "sprint",
          tickets: [],
          color: "#aaaaaa",
          startsAt,
          endsAt: null,
          completedAt: null,
          createdBy: f.userId,
          createdAt: "2026-10-19T00:00:00Z",
          updatedAt: "2026-10-19T00:00:00Z",
          body: ""
        })
        yield* Effect.provide(
          Effect.flatMap(GroupDocs, (docs) =>
            docs.create(f.orgId, "project", document)
          ).pipe(
            Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
          ),
          f.instance.context
        )
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query<{
            id: string
            available_at: Date
            payload: { kind: string }
          }>(
            "select n.id,n.available_at,n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        expect(jobs.rows[0]?.available_at.toISOString()).toBe(startsAt)
        expect(jobs.rows[0]?.payload.kind).toBe("sprint_started")
        yield* Effect.provide(
          Effect.flatMap(GroupDocs, (docs) =>
            docs.write(f.orgId, "project", document.id, {
              ...document,
              startsAt: null
            })
          ).pipe(
            Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
          ),
          f.instance.context
        )
        const id = jobs.rows[0].id
        yield* Effect.provide(
          Effect.flatMap(SlackDelivery, (delivery) => delivery.deliver(id, 0)),
          f.instance.context
        )
        expect(
          f.calls.filter((call) => call.method === "chat.postMessage")
        ).toHaveLength(0)
        expect(
          (yield* Effect.promise(() =>
            pool.query<{ error: string }>(
              "select error from slack_notification where id=$1",
              [id]
            )
          )).rows[0]?.error
        ).toBe("sprint_changed")
      })
  )

  it.live("retries a sprint start when the sprint file cannot be read", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* Effect.provide(
        Effect.flatMap(GroupDocs, (docs) =>
          docs.create(
            f.orgId,
            "project",
            decodeGroupDetailSync({
              id: "G-1",
              name: "Sprint one",
              kind: "sprint",
              tickets: [],
              color: "#aaaaaa",
              startsAt: "2030-01-01T09:00:00.000Z",
              endsAt: null,
              completedAt: null,
              createdBy: f.userId,
              createdAt: "2026-10-19T00:00:00Z",
              updatedAt: "2026-10-19T00:00:00Z",
              body: ""
            })
          )
        ).pipe(
          Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
        ),
        f.instance.context
      )
      yield* f.enqueue()
      const jobs = yield* Effect.promise(() =>
        pool.query<{ id: string }>(
          "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
          [f.projectId]
        )
      )
      yield* f.fs.readDirectory(f.root, { recursive: true }).pipe(
        Effect.map((names) =>
          names
            .map((name) => `${f.root}/${name}`)
            .find((name) => name.endsWith("/G-1.md"))!
        ),
        Effect.tap((path) => f.fs.remove(path)),
        Effect.tap((path) => f.fs.makeDirectory(path))
      )
      const id = jobs.rows[0].id
      const outcome = yield* Effect.provide(
        Effect.flatMap(SlackDelivery, (delivery) => delivery.deliver(id, 0)),
        f.instance.context
      )
      expect(outcome.kind).toBe("retry")
      expect(
        (yield* Effect.promise(() =>
          pool.query<{ finished_at: Date | null }>(
            "select finished_at from slack_notification where id=$1",
            [id]
          )
        )).rows[0]?.finished_at
      ).toBeNull()
    })
  )

  it.effect(
    "does not announce a sprint start for a sprint without a start date",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        yield* Effect.provide(
          Effect.flatMap(GroupDocs, (docs) =>
            docs.create(
              f.orgId,
              "project",
              decodeGroupDetailSync({
                id: "G-1",
                name: "Undated sprint",
                kind: "sprint",
                tickets: [],
                color: "#aaaaaa",
                startsAt: null,
                endsAt: null,
                completedAt: null,
                createdBy: f.userId,
                createdAt: "2026-10-19T00:00:00Z",
                updatedAt: "2026-10-19T00:00:00Z",
                body: ""
              })
            )
          ).pipe(
            Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
          ),
          f.instance.context
        )
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query(
            "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        expect(jobs.rows).toHaveLength(0)
      })
  )

  it.effect(
    "keeps queued deliveries when the project's Slack settings are saved again",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        yield* f.create()
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query(
            "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        yield* f.asProject(
          Effect.flatMap(SlackIntegrations, (slack) =>
            slack.saveProject({
              channelId: "CNOTIFY",
              events: ["ticket_created"]
            })
          )
        )
        yield* Effect.provide(
          Effect.flatMap(SlackDelivery, (delivery) =>
            delivery.deliver(jobs.rows[0].id, 0)
          ),
          f.instance.context
        )
        expect(
          f.calls.filter((call) => call.method === "chat.postMessage")
        ).toHaveLength(1)
      })
  )

  it.effect(
    "drops queued deliveries after a project disconnects and only lists channels the bot has joined",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture()
        expect(
          yield* f.asProject(
            Effect.flatMap(SlackIntegrations, (slack) => slack.channels())
          )
        ).toEqual([{ id: "CNOTIFY", name: "project" }])
        yield* f.create()
        yield* f.enqueue()
        const jobs = yield* Effect.promise(() =>
          pool.query(
            "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
            [f.projectId]
          )
        )
        yield* f.asProject(
          Effect.flatMap(SlackIntegrations, (slack) =>
            slack.disconnectProject()
          )
        )
        yield* Effect.provide(
          Effect.flatMap(SlackDelivery, (delivery) =>
            delivery.deliver(jobs.rows[0].id, 0)
          ),
          f.instance.context
        )
        expect(
          f.calls.filter((call) => call.method === "chat.postMessage")
        ).toHaveLength(0)
        expect(
          (yield* Effect.promise(() =>
            pool.query("select error from slack_notification where id=$1", [
              jobs.rows[0].id
            ])
          )).rows[0]?.error
        ).toBe("connection_changed")
      })
  )
})
