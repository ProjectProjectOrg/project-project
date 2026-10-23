// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
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
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { SlackHostLive } from "./HostLive"

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

  const fixture = async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12)
    const orgId = `slack-${suffix}`
    const adminId = `admin-${suffix}`
    const userId = `sharer-${suffix}`
    const projectId = randomUUID()
    const fs = await Effect.runPromise(
      Effect.service(FileSystem.FileSystem).pipe(
        Effect.provide(BunServices.layer)
      )
    )
    const root = await Effect.runPromise(
      fs.makeTempDirectory({ prefix: "pp-slack-" })
    )
    await pool.query(
      'insert into "user" (id,name,email,created_at,updated_at) values ($1,$1,$2,now(),now()),($3,$3,$4,now(),now())',
      [adminId, `${adminId}@example.test`, userId, `${userId}@example.test`]
    )
    await pool.query(
      "insert into organization (id,name,slug,created_at) values ($1,$1,$1,now())",
      [orgId]
    )
    await pool.query(
      "insert into member (id,organization_id,user_id,role,created_at) values ($1,$3,$1,'admin',now()),($2,$3,$2,'member',now())",
      [adminId, userId, orgId]
    )
    await pool.query(
      "insert into project_index (id,organization_id,slug,key,name,icon,color,created_by) values ($1,$2,'project','T','Project','folder','#aaaaaa',$3)",
      [projectId, orgId, adminId]
    )
    await pool.query(
      "insert into project_member (project_id,organization_id,user_id,role_id) values ($1,$2,$3,'pm'),($1,$2,$4,'developer')",
      [projectId, orgId, adminId, userId]
    )
    await pool.query(
      "insert into project_status (project_id,slug,label,icon,color,order_key,created_by) values ($1,'todo','Todo','Circle','#aaaaaa','a0',$2),($1,'done','Done','CircleCheck','#aaaaaa','a1',$2)",
      [projectId, adminId]
    )
    cleanup.push(async () => {
      await pool.query("delete from organization where id=$1", [orgId])
      await pool.query('delete from "user" where id=any($1)', [
        [adminId, userId]
      ])
      await Effect.runPromise(fs.remove(root, { recursive: true }))
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
    const makeRuntime = () => {
      const runtime = ManagedRuntime.make(
        services.pipe(Layer.provide(infrastructure))
      )
      cleanup.push(() => runtime.dispose())
      return runtime
    }
    const makeWorkflowRuntime = () => {
      const runtime = ManagedRuntime.make(
        SlackDeliveryWorkflowLive.pipe(
          Layer.provideMerge(services),
          Layer.provideMerge(engine),
          Layer.provide(infrastructure)
        )
      )
      cleanup.push(() => runtime.dispose())
      return runtime
    }
    const runtime = makeRuntime()
    const [admin, sharer] = await runtime.runPromise(
      Effect.flatMap(Users, (users) => users.fullByIds([adminId, userId]))
    )
    const administrator = admin?.id === adminId ? admin : sharer
    if (!administrator) throw new Error("Admin missing")
    const orgScope = await runtime.runPromise(
      Effect.flatMap(Access, (access) => access.org(orgId)).pipe(
        Effect.provideService(CurrentUser, administrator)
      )
    )
    const projectScope = await runtime.runPromise(
      Effect.flatMap(Access, (access) => access.project(orgId, "project")).pipe(
        Effect.provideService(CurrentUser, administrator)
      )
    )
    const asOrg = <A, E>(
      effect: Effect.Effect<A, E, OrgScope | SlackIntegrations>
    ) =>
      runtime.runPromise(effect.pipe(Effect.provideService(OrgScope, orgScope)))
    const asProject = <A, E>(
      effect: Effect.Effect<A, E, ProjectScope | SlackIntegrations>
    ) =>
      runtime.runPromise(
        effect.pipe(Effect.provideService(ProjectScope, projectScope))
      )
    await asOrg(
      Effect.flatMap(SlackIntegrations, (slack) =>
        slack.connectOrg({
          botToken: "xoxb-test",
          appToken: "xapp-test",
          clientId: "123.456",
          clientSecret: "client-secret"
        })
      )
    )
    await asProject(
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
      runtime.runPromise(
        Effect.flatMap(TicketDocs, (docs) =>
          docs.create(orgId, "project", document)
        )
      )
    const begin = () =>
      runtime.runPromise(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.beginOAuth(userId, orgId, "browser-session")
        )
      )
    const complete = (url: string, binding = "browser-session") =>
      runtime.runPromise(
        Effect.flatMap(SlackIntegrations, (slack) =>
          slack.completeOAuth(
            userId,
            "code",
            new URL(url).searchParams.get("state")!,
            binding
          )
        )
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
      runtime.runPromise(
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
        )
      )
    return {
      runtime,
      makeRuntime,
      makeWorkflowRuntime,
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
        runtime.runPromise(
          Effect.flatMap(SlackEvents, (events) => events.enqueue())
        )
    }
  }

  it("saves tickets while Slack is offline and recovers the file-to-job handoff after a new runtime starts", async () => {
    const f = await fixture()
    f.response.sendMode = "offline"
    const trigger = `slack_fail_${f.suffix}`
    await pool.query(
      `create function ${trigger}() returns trigger language plpgsql as $$ begin raise exception 'injected handoff failure'; end $$`
    )
    await pool.query(
      `create trigger ${trigger} before insert on project_integration_event for each row execute function ${trigger}()`
    )
    cleanup.push(async () => {
      await pool.query(
        `drop trigger if exists ${trigger} on project_integration_event`
      )
      await pool.query(`drop function if exists ${trigger}()`)
    })
    await f.create()
    expect(
      f.calls.filter((call) => call.method === "chat.postMessage")
    ).toHaveLength(0)
    expect(
      (
        await pool.query(
          "select batch_id from ticket_activity_outbox where project_id=$1",
          [f.projectId]
        )
      ).rowCount
    ).toBe(1)
    await f.runtime.dispose()
    await pool.query(`drop trigger ${trigger} on project_integration_event`)
    const restarted = f.makeRuntime()
    await restarted.runPromise(
      Effect.flatMap(TicketActivity, (activity) => activity.recover())
    )
    const pending = await pool.query(
      "select e.id from project_integration_event e join project_integration_link l on l.id=e.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(pending.rowCount).toBe(1)
    await pool.query(
      `create trigger ${trigger} before insert on slack_notification for each row execute function ${trigger}()`
    )
    cleanup.push(() =>
      pool
        .query(`drop trigger if exists ${trigger} on slack_notification`)
        .then(() => undefined)
    )
    await expect(
      restarted.runPromise(
        Effect.flatMap(SlackEvents, (events) => events.enqueue())
      )
    ).rejects.toBeDefined()
    expect(
      (
        await pool.query(
          "select consumed_at from project_integration_event where id=$1",
          [pending.rows[0].id]
        )
      ).rows[0].consumed_at
    ).toBeNull()
    await pool.query(`drop trigger ${trigger} on slack_notification`)
    await restarted.dispose()
    const dispatcher = f.makeRuntime()
    await dispatcher.runPromise(
      Effect.flatMap(SlackEvents, (events) => events.enqueue())
    )
    await dispatcher.runPromise(
      Effect.flatMap(SlackEvents, (events) => events.enqueue())
    )
    const jobs = await pool.query(
      "select payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(jobs.rows.map((row) => row.payload.kind)).toEqual(["ticket_created"])
    await dispatcher.runPromise(
      Effect.flatMap(TicketActivity, (activity) => activity.recover())
    )
    expect(
      (
        await pool.query(
          "select batch_id from ticket_activity_outbox where project_id=$1",
          [f.projectId]
        )
      ).rowCount
    ).toBe(0)
  }, 20_000)

  it("checks OAuth state, browser binding, workspace identity and replay before linking an account", async () => {
    const f = await fixture()
    const started = await f.begin()
    await expect(f.complete(started, "another-browser")).rejects.toMatchObject({
      _tag: "SlackAuthInvalid"
    })
    const team = f.response.teamId
    f.response.teamId = "TWRONG"
    await expect(f.complete(started)).rejects.toMatchObject({
      _tag: "SlackAuthInvalid"
    })
    expect(
      (
        await pool.query(
          "select user_id from user_slack_integration where user_id=$1",
          [f.userId]
        )
      ).rowCount
    ).toBe(0)
    f.response.teamId = team
    const retry = await f.begin()
    await f.complete(retry)
    await expect(f.complete(retry)).rejects.toMatchObject({
      _tag: "SlackAuthInvalid"
    })
    const profile = await f.runtime.runPromise(
      Effect.flatMap(SlackIntegrations, (slack) => slack.profiles(f.userId))
    )
    expect(profile[0]?.slackUserId).toBe("USHARER")
    const stored = await pool.query(
      "select ciphertext from organization_slack_integration where team_id=$1",
      [team]
    )
    expect(stored.rows[0]?.ciphertext).not.toContain("xoxb-test")
    expect(stored.rows[0]?.ciphertext).not.toContain("client-secret")
  })

  it("preserves a connection conflict as a typed error", async () => {
    const f = await fixture()
    f.response.teamId = "TANOTHER"
    const result = await f.asOrg(
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

  it("rejects an app-level token that belongs to a different Slack app", async () => {
    const f = await fixture()
    f.response.socketUrl = "wss://slack.example.test/socket?app_id=AOTHER"
    const result = await f.asOrg(
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

  it("retries delivery after a transient database failure while recording success", async () => {
    const f = await fixture()
    await f.create()
    await f.enqueue()
    const jobs = await pool.query<{ id: string }>(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    const id = Schema.decodeUnknownSync(Schema.String)(jobs.rows[0]?.id)
    const trigger = `slack_retry_${f.suffix}`
    await pool.query(`create sequence ${trigger}`)
    await pool.query(`create function ${trigger}() returns trigger language plpgsql as $$
      begin
        if new.id = TG_ARGV[0] and new.finished_at is not null and nextval('${trigger}') = 1 then
          raise exception 'transient database failure' using errcode = '40001';
        end if;
        return new;
      end $$`)
    await pool.query(
      `create trigger ${trigger} before update on slack_notification for each row execute function ${trigger}('${id}')`
    )
    cleanup.push(async () => {
      await pool.query(
        `drop trigger if exists ${trigger} on slack_notification`
      )
      await pool.query(`drop function if exists ${trigger}()`)
      await pool.query(`drop sequence if exists ${trigger}`)
    })
    const runtime = f.makeWorkflowRuntime()
    await runtime.runPromise(SlackDeliveryWorkflow.execute({ id }))
    const sent = f.calls.filter((call) => call.method === "chat.postMessage")
    expect(sent.map((call) => call.body.client_msg_id)).toEqual([id, id])
    expect(
      (
        await pool.query(
          "select finished_at,error from slack_notification where id=$1",
          [id]
        )
      ).rows[0]
    ).toMatchObject({
      finished_at: expect.any(Date),
      error: null
    })
  }, 20_000)

  it("privately prompts an unlinked sharer, then previews only with current ticket access", async () => {
    const f = await fixture()
    await f.create()
    for (const url of [
      `https://another.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`,
      "https://pp.example.test/orgs/another-org/projects/project/tickets/T-1",
      `https://pp.example.test/orgs/${f.orgId}/projects/project`
    ])
      await f.preview({ url })
    expect(
      f.calls.filter((call) => call.method === "chat.unfurl")
    ).toHaveLength(0)
    await f.preview()
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
    expect(JSON.stringify(prompts[0]?.body)).not.toContain("Fix <!channel>")
    expect(JSON.stringify(prompts[0]?.body)).not.toContain(
      "Private description"
    )
    f.calls.length = 0
    await f.preview({ source: "composer" })
    expect(
      f.calls.find((call) => call.method === "chat.unfurl")?.body
    ).toMatchObject({
      unfurl_id: "composer-preview",
      source: "composer",
      user_auth_message: expect.stringContaining("Connect PP to show previews")
    })
    expect(
      f.calls.find((call) => call.method === "chat.unfurl")?.body
    ).not.toHaveProperty("channel")
    f.calls.length = 0
    await f.complete(await f.begin())
    const ticketUrl = `https://pp.example.test/orgs/${f.orgId}/projects/project/tickets/T-1`
    await f.preview({ urls: [ticketUrl, `${ticketUrl}?share=2`] })
    const previews = f.calls.filter((call) => call.method === "chat.unfurl")
    expect(previews).toHaveLength(1)
    expect(previews[0]?.body.channel).toBe("CUNRELATED")
    expect(Object.keys(previews[0]?.body.unfurls ?? {})).toHaveLength(2)
    expect(JSON.stringify(previews[0]?.body)).toContain("Fix <!channel>")
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
    expect(JSON.stringify(previews[0]?.body)).not.toContain(
      "Private description"
    )
    await pool.query(
      "delete from project_member where project_id=$1 and user_id=$2",
      [f.projectId, f.userId]
    )
    await f.preview()
    expect(
      f.calls.filter((call) => call.method === "chat.unfurl")
    ).toHaveLength(1)
  })

  it("survives a SQL workflow restart while waiting to retry Slack's rate limit", async () => {
    const f = await fixture()
    await f.create()
    await f.enqueue()
    const jobs = await pool.query(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    const id = Schema.decodeUnknownSync(Schema.String)(jobs.rows[0]?.id)
    f.response.sendMode = "limited"
    const first = f.makeWorkflowRuntime()
    await first.runPromise(
      SlackDeliveryWorkflow.execute({ id }, { discard: true })
    )
    await expect
      .poll(
        () =>
          f.calls.filter((call) => call.method === "chat.postMessage").length,
        { timeout: 10_000 }
      )
      .toBe(1)
    await first.dispose()
    expect(
      (
        await pool.query(
          "select finished_at from slack_notification where id=$1",
          [id]
        )
      ).rows[0]?.finished_at
    ).toBeNull()
    f.response.sendMode = "ok"
    const restarted = f.makeWorkflowRuntime()
    await restarted.runPromise(SlackDeliveryWorkflow.execute({ id }))
    const sent = f.calls.filter((call) => call.method === "chat.postMessage")
    expect(sent).toHaveLength(2)
    expect(sent.map((call) => call.body.client_msg_id)).toEqual([id, id])
    expect(sent[1]?.body.text).toContain("Fix &lt;!channel&gt;")
    expect(
      (
        await pool.query(
          "select finished_at,error from slack_notification where id=$1",
          [id]
        )
      ).rows[0]
    ).toMatchObject({ error: null, finished_at: expect.any(Date) })
    await restarted.runPromise(SlackDeliveryWorkflow.execute({ id }))
    expect(
      f.calls.filter((call) => call.method === "chat.postMessage")
    ).toHaveLength(2)
  }, 30_000)

  it("records subscribed events for each integration and lets Slack consume only its own", async () => {
    const f = await fixture()
    const parentId = randomUUID()
    const linkId = randomUUID()
    await pool.query(
      "insert into organization_integration (id,organization_id,provider,status) values ($1,$2,'figma','active')",
      [parentId, f.orgId]
    )
    await pool.query(
      `insert into project_integration_link (id,project_id,organization_id,organization_integration_id,provider,status,subscribed_events)
       values ($1,$2,$3,$4,'figma','active','["ticket_created"]')`,
      [linkId, f.projectId, f.orgId, parentId]
    )
    await f.create()
    const pending = await pool.query<Readonly<{ id: string }>>(
      "select id from project_integration_event where project_integration_link_id=$1",
      [linkId]
    )
    expect(pending.rowCount).toBe(1)
    await f.enqueue()
    await f.enqueue()
    expect(
      (
        await pool.query(
          "select consumed_at from project_integration_event where id=$1",
          [pending.rows[0]!.id]
        )
      ).rows[0].consumed_at
    ).toBeNull()
    const jobs = await pool.query<
      Readonly<{ payload: Readonly<{ kind: string }> }>
    >(
      "select n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(jobs.rows.map((row) => row.payload.kind)).toEqual(["ticket_created"])
  })

  it("records only selected ticket transitions", async () => {
    const f = await fixture()
    await f.asProject(
      Effect.flatMap(SlackIntegrations, (slack) =>
        slack.saveProject({
          channelId: "CNOTIFY",
          events: ["ticket_completed"]
        })
      )
    )
    await f.create()
    for (const status of ["done", "todo"]) {
      await f.runtime.runPromise(
        Effect.flatMap(TicketDocs, (docs) =>
          docs.update(f.orgId, "project", "T-1", (current) =>
            Effect.succeed({ ...current, status: decodeStatus(status) })
          )
        ).pipe(
          Effect.provideService(ActivityActor, ActivityActor.user(f.userId))
        )
      )
    }
    await f.enqueue()
    const jobs = await pool.query<{ payload: { kind: string } }>(
      "select n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(jobs.rows.map((row) => row.payload.kind)).toEqual([
      "ticket_completed"
    ])
  })

  it("schedules sprint starts locally and discards a start after the sprint is rescheduled", async () => {
    const f = await fixture()
    const startsAt = "2030-01-01T09:00:00.000Z"
    const document = Schema.decodeSync(GroupDetail)({
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
    await f.runtime.runPromise(
      Effect.flatMap(GroupDocs, (docs) =>
        docs.create(f.orgId, "project", document)
      ).pipe(Effect.provideService(ActivityActor, ActivityActor.user(f.userId)))
    )
    await f.enqueue()
    const jobs = await pool.query<{
      id: string
      available_at: Date
      payload: { kind: string }
    }>(
      "select n.id,n.available_at,n.payload from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(jobs.rows[0]?.available_at.toISOString()).toBe(startsAt)
    expect(jobs.rows[0]?.payload.kind).toBe("sprint_started")
    await f.runtime.runPromise(
      Effect.flatMap(GroupDocs, (docs) =>
        docs.write(f.orgId, "project", document.id, {
          ...document,
          startsAt: null
        })
      ).pipe(Effect.provideService(ActivityActor, ActivityActor.user(f.userId)))
    )
    const id = jobs.rows[0]!.id
    await f.runtime.runPromise(
      Effect.flatMap(SlackDelivery, (delivery) => delivery.deliver(id, 0))
    )
    expect(
      f.calls.filter((call) => call.method === "chat.postMessage")
    ).toHaveLength(0)
    expect(
      (
        await pool.query<{ error: string }>(
          "select error from slack_notification where id=$1",
          [id]
        )
      ).rows[0]?.error
    ).toBe("sprint_changed")
  })

  it("retries a sprint start when the sprint file cannot be read", async () => {
    const f = await fixture()
    await f.runtime.runPromise(
      Effect.flatMap(GroupDocs, (docs) =>
        docs.create(
          f.orgId,
          "project",
          Schema.decodeSync(GroupDetail)({
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
      ).pipe(Effect.provideService(ActivityActor, ActivityActor.user(f.userId)))
    )
    await f.enqueue()
    const jobs = await pool.query<{ id: string }>(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    await Effect.runPromise(
      f.fs.readDirectory(f.root, { recursive: true }).pipe(
        Effect.map((names) =>
          names
            .map((name) => `${f.root}/${name}`)
            .find((name) => name.endsWith("/G-1.md"))!
        ),
        Effect.tap((path) => f.fs.remove(path)),
        Effect.tap((path) => f.fs.makeDirectory(path))
      )
    )
    const id = jobs.rows[0]!.id
    const outcome = await f.runtime.runPromise(
      Effect.flatMap(SlackDelivery, (delivery) => delivery.deliver(id, 0))
    )
    expect(outcome.kind).toBe("retry")
    expect(
      (
        await pool.query<{ finished_at: Date | null }>(
          "select finished_at from slack_notification where id=$1",
          [id]
        )
      ).rows[0]?.finished_at
    ).toBeNull()
  })

  it("does not announce a sprint start for a sprint without a start date", async () => {
    const f = await fixture()
    await f.runtime.runPromise(
      Effect.flatMap(GroupDocs, (docs) =>
        docs.create(
          f.orgId,
          "project",
          Schema.decodeSync(GroupDetail)({
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
      ).pipe(Effect.provideService(ActivityActor, ActivityActor.user(f.userId)))
    )
    await f.enqueue()
    const jobs = await pool.query(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    expect(jobs.rows).toHaveLength(0)
  })

  it("keeps queued deliveries when the project's Slack settings are saved again", async () => {
    const f = await fixture()
    await f.create()
    await f.enqueue()
    const jobs = await pool.query(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    await f.asProject(
      Effect.flatMap(SlackIntegrations, (slack) =>
        slack.saveProject({
          channelId: "CNOTIFY",
          events: ["ticket_created"]
        })
      )
    )
    await f.runtime.runPromise(
      Effect.flatMap(SlackDelivery, (delivery) =>
        delivery.deliver(jobs.rows[0].id, 0)
      )
    )
    expect(
      f.calls.filter((call) => call.method === "chat.postMessage")
    ).toHaveLength(1)
  })

  it("drops queued deliveries after a project disconnects and only lists channels the bot has joined", async () => {
    const f = await fixture()
    expect(
      await f.asProject(
        Effect.flatMap(SlackIntegrations, (slack) => slack.channels())
      )
    ).toEqual([{ id: "CNOTIFY", name: "project" }])
    await f.create()
    await f.enqueue()
    const jobs = await pool.query(
      "select n.id from slack_notification n join project_integration_link l on l.id=n.project_integration_link_id where l.project_id=$1",
      [f.projectId]
    )
    await f.asProject(
      Effect.flatMap(SlackIntegrations, (slack) => slack.disconnectProject())
    )
    await f.runtime.runPromise(
      Effect.flatMap(SlackDelivery, (delivery) =>
        delivery.deliver(jobs.rows[0].id, 0)
      )
    )
    expect(
      f.calls.filter((call) => call.method === "chat.postMessage")
    ).toHaveLength(0)
    expect(
      (
        await pool.query("select error from slack_notification where id=$1", [
          jobs.rows[0].id
        ])
      ).rows[0]?.error
    ).toBe("connection_changed")
  })
})
