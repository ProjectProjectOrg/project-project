import { createHash, randomBytes } from "node:crypto"

import { Db } from "@pp/db"
import {
  member,
  organization,
  organizationIntegration,
  organizationSlackIntegration,
  projectIntegrationLink,
  projectSlackIntegration,
  slackNotification,
  slackOauthState,
  userSlackIntegration
} from "@pp/db/schema"
import {
  Conflict,
  ConnectSlackInput,
  NotFound,
  OrgScope,
  ProjectScope,
  SlackAuthInvalid,
  SlackError,
  SlackNotConnected,
  type SlackOrgStatus,
  type SlackProjectStatus,
  type SaveSlackProjectInput
} from "@pp/shared"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { SlackClient } from "./Client"
import { SlackHost } from "./Host"

export const slackCallbackPath = "/api/integrations/slack/oauth/callback"
export const slackPublicUrl = Config.String("BETTER_AUTH_URL").pipe(
  Config.withDefault("http://localhost:5173")
)
export const hashSlackState = (value: string) =>
  createHash("sha256").update(value).digest("hex")

export const makeSlackManifest = (baseUrl: string) => {
  const url = new URL(baseUrl)
  const host = url.hostname
  const supportsUnfurls =
    host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":")
  const redirectUri = new URL(slackCallbackPath, url).toString()
  const manifest = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
    display_information: {
      name: "ProjectProject",
      description: "Project updates and ticket previews"
    },
    features: {
      bot_user: { display_name: "ProjectProject", always_online: false },
      unfurl_domains: supportsUnfurls ? [host] : []
    },
    oauth_config: {
      redirect_urls: [redirectUri],
      scopes: {
        bot: [
          "chat:write",
          "channels:read",
          "groups:read",
          "links:read",
          "links:write",
          "users:read"
        ]
      }
    },
    settings: {
      socket_mode_enabled: true,
      event_subscriptions: { bot_events: ["link_shared"] },
      token_rotation_enabled: false
    }
  })
  const createUrl = new URL("https://api.slack.com/apps")
  createUrl.searchParams.set("new_app", "1")
  createUrl.searchParams.set("manifest_json", manifest)
  return { manifest, createUrl: createUrl.toString(), redirectUri }
}

export const makeSlackIntegrations = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  const db = yield* Db
  const client = yield* SlackClient
  const secrets = yield* SlackHost
  const baseUrl = yield* slackPublicUrl
  const redirectUri = new URL(slackCallbackPath, baseUrl).toString()

  const connection = (organizationId: string) =>
    db
      .select({
        id: organizationIntegration.id,
        teamId: organizationSlackIntegration.teamId,
        teamName: organizationSlackIntegration.teamName,
        appId: organizationSlackIntegration.appId,
        botUserId: organizationSlackIntegration.botUserId,
        clientId: organizationSlackIntegration.clientId,
        ciphertext: organizationSlackIntegration.ciphertext,
        nonce: organizationSlackIntegration.nonce,
        tag: organizationSlackIntegration.tag,
        lastError: organizationIntegration.lastCheckError
      })
      .from(organizationIntegration)
      .innerJoin(
        organizationSlackIntegration,
        eq(
          organizationSlackIntegration.organizationIntegrationId,
          organizationIntegration.id
        )
      )
      .where(
        and(
          eq(organizationIntegration.organizationId, organizationId),
          eq(organizationIntegration.provider, "slack"),
          eq(organizationIntegration.status, "active")
        )
      )
      .limit(1)
      .pipe(
        Effect.orDie,
        Effect.map((rows) => rows[0] ?? null)
      )

  const credentials = Effect.fn("Slack.credentials")(function* (
    organizationId: string
  ) {
    const row = yield* connection(organizationId)
    if (!row) return yield* new SlackNotConnected()
    const plaintext = yield* secrets.open(row)
    const values = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ConnectSlackInput)
    )(plaintext).pipe(
      Effect.mapError(() => new SlackError({ reason: "encryption" }))
    )
    return { ...row, ...values }
  })

  const orgStatus = Effect.fn("Slack.orgStatus")(function* (): Effect.fn.Return<
    SlackOrgStatus,
    never,
    OrgScope
  > {
    const scope = yield* OrgScope
    const row = yield* connection(scope.organizationId)
    return {
      connection: row
        ? {
            teamId: row.teamId,
            teamName: row.teamName,
            clientId: row.clientId,
            lastError: row.lastError
          }
        : null
    }
  })
  const disconnectOrg = Effect.fn("Slack.disconnectOrg")(function* () {
    const scope = yield* OrgScope
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.id, scope.organizationId))
            .for("update")
          const row = yield* connection(scope.organizationId)
          if (!row) return
          yield* db
            .update(projectIntegrationLink)
            .set({ status: "disconnected", disconnectedAt: sql`now()` })
            .where(eq(projectIntegrationLink.organizationIntegrationId, row.id))
          yield* db
            .delete(organizationSlackIntegration)
            .where(
              eq(organizationSlackIntegration.organizationIntegrationId, row.id)
            )
          yield* db
            .update(organizationIntegration)
            .set({ status: "disconnected", disconnectedAt: sql`now()` })
            .where(eq(organizationIntegration.id, row.id))
        })
      )
      .pipe(Effect.orDie)
    return yield* orgStatus()
  })
  const connectOrg = Effect.fn("Slack.connectOrg")(function* (
    input: ConnectSlackInput
  ) {
    const scope = yield* OrgScope
    const identity = yield* client.identity(input.botToken)
    const appId = yield* client.appId(input.botToken, identity.bot_id)
    yield* client.socketUrl(input.appToken)
    const serialized = yield* Schema.encodeEffect(
      Schema.fromJsonString(ConnectSlackInput)
    )(input).pipe(Effect.orDie)
    const encrypted = yield* secrets.seal(serialized)
    const now = yield* DateTime.nowAsDate
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.id, scope.organizationId))
            .for("update")
          const previous = yield* connection(scope.organizationId)
          if (
            previous &&
            (previous.teamId !== identity.team_id ||
              previous.appId !== appId ||
              previous.clientId !== input.clientId)
          )
            return yield* new Conflict({ reason: "slack_disconnect_first" })
          const [other] = yield* db
            .select()
            .from(organizationSlackIntegration)
            .where(eq(organizationSlackIntegration.teamId, identity.team_id))
            .limit(1)
          if (other && other.organizationIntegrationId !== previous?.id)
            return yield* new Conflict({ reason: "slack_workspace_connected" })
          const [parent] = previous
            ? [{ id: previous.id }]
            : yield* db
                .insert(organizationIntegration)
                .values({
                  organizationId: scope.organizationId,
                  provider: "slack",
                  status: "active"
                })
                .returning({ id: organizationIntegration.id })
          if (!parent) return yield* new SlackError({ reason: "save_failed" })
          yield* db
            .insert(organizationSlackIntegration)
            .values({
              organizationIntegrationId: parent.id,
              teamId: identity.team_id,
              teamName: identity.team,
              appId,
              botUserId: identity.user_id,
              clientId: input.clientId,
              ...encrypted
            })
            .onConflictDoUpdate({
              target: organizationSlackIntegration.organizationIntegrationId,
              set: { ...encrypted, teamName: identity.team }
            })
          yield* db
            .update(organizationIntegration)
            .set({ lastCheckedAt: now, lastCheckError: null, updatedAt: now })
            .where(eq(organizationIntegration.id, parent.id))
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    return yield* orgStatus()
  })

  const projectStatus = Effect.fn("Slack.projectStatus")(
    function* (): Effect.fn.Return<SlackProjectStatus, never, ProjectScope> {
      const scope = yield* ProjectScope
      const row = yield* connection(scope.organizationId)
      if (!row) return { workspace: null, settings: null }
      const [settings] = yield* db
        .select({
          channelId: projectSlackIntegration.channelId,
          channelName: projectSlackIntegration.channelName,
          events: projectIntegrationLink.subscribedEvents
        })
        .from(projectIntegrationLink)
        .innerJoin(
          projectSlackIntegration,
          eq(
            projectSlackIntegration.projectIntegrationLinkId,
            projectIntegrationLink.id
          )
        )
        .where(
          and(
            eq(projectIntegrationLink.projectId, scope.projectId),
            eq(projectIntegrationLink.organizationIntegrationId, row.id),
            eq(projectIntegrationLink.status, "active")
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      return {
        workspace: { teamId: row.teamId, teamName: row.teamName },
        settings: settings
          ? { ...settings, channelId: settings.channelId }
          : null
      }
    }
  )
  const channels = Effect.fn("Slack.channels")(function* () {
    const scope = yield* ProjectScope
    const { botToken } = yield* credentials(scope.organizationId)
    const output: Array<
      Readonly<{
        id: typeof import("@pp/shared").SlackChannelId.Type
        name: string
      }>
    > = []
    let cursor = ""
    do {
      const page = yield* client.channels(botToken, cursor)
      output.push(
        ...page.channels
          .filter((channel) => channel.is_member && !channel.is_archived)
          .map(({ id, name }) => ({ id, name }))
      )
      cursor = page.response_metadata?.next_cursor ?? ""
    } while (cursor)
    return output.toSorted((a, b) => a.name.localeCompare(b.name))
  })
  const saveProject = Effect.fn("Slack.saveProject")(function* (
    input: SaveSlackProjectInput
  ) {
    const scope = yield* ProjectScope
    const row = yield* credentials(scope.organizationId)
    const channel = yield* client.channel(row.botToken, input.channelId)
    if (!channel.is_member || channel.is_archived)
      return yield* new SlackError({ reason: "not_in_channel" })
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.id, scope.organizationId))
            .for("update")
          const current = yield* connection(scope.organizationId)
          if (!current || current.id !== row.id)
            return yield* new SlackNotConnected()
          const [previous] = yield* db
            .select()
            .from(projectIntegrationLink)
            .where(
              and(
                eq(projectIntegrationLink.projectId, scope.projectId),
                eq(projectIntegrationLink.provider, "slack"),
                eq(projectIntegrationLink.status, "active")
              )
            )
            .limit(1)
          if (previous)
            yield* db
              .update(projectIntegrationLink)
              .set({ status: "disconnected", disconnectedAt: sql`now()` })
              .where(eq(projectIntegrationLink.id, previous.id))
          const [link] = yield* db
            .insert(projectIntegrationLink)
            .values({
              projectId: scope.projectId,
              organizationId: scope.organizationId,
              organizationIntegrationId: row.id,
              provider: "slack",
              subscribedEvents: [...new Set(input.events)],
              status: "active"
            })
            .returning({ id: projectIntegrationLink.id })
          if (!link) return yield* new SlackError({ reason: "save_failed" })
          yield* db.insert(projectSlackIntegration).values({
            projectIntegrationLinkId: link.id,
            channelId: channel.id,
            channelName: channel.name
          })
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    return yield* projectStatus()
  })
  const disconnectProject = Effect.fn("Slack.disconnectProject")(function* () {
    const scope = yield* ProjectScope
    yield* db
      .update(projectIntegrationLink)
      .set({ status: "disconnected", disconnectedAt: sql`now()` })
      .where(
        and(
          eq(projectIntegrationLink.projectId, scope.projectId),
          eq(projectIntegrationLink.provider, "slack")
        )
      )
      .pipe(Effect.orDie)
    return yield* projectStatus()
  })
  const testProject = Effect.fn("Slack.testProject")(function* () {
    const scope = yield* ProjectScope
    const [link] = yield* db
      .select()
      .from(projectIntegrationLink)
      .where(
        and(
          eq(projectIntegrationLink.projectId, scope.projectId),
          eq(projectIntegrationLink.provider, "slack"),
          eq(projectIntegrationLink.status, "active")
        )
      )
      .limit(1)
      .pipe(Effect.orDie)
    if (!link) return yield* new SlackNotConnected()
    yield* db
      .insert(slackNotification)
      .values({
        id: yield* crypto.randomUUIDv7.pipe(Effect.orDie),
        projectIntegrationLinkId: link.id,
        payload: {
          kind: "test",
          title: "ProjectProject notifications are connected."
        },
        actorId: scope.userId
      })
      .pipe(Effect.orDie)
  })

  const profiles = Effect.fn("Slack.profiles")(function* (userId: string) {
    return yield* db
      .select({
        orgSlug: organization.slug,
        orgName: organization.name,
        teamName: organizationSlackIntegration.teamName,
        slackUserId: userSlackIntegration.slackUserId,
        displayName: userSlackIntegration.displayName
      })
      .from(organization)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, organization.id),
          eq(member.userId, userId)
        )
      )
      .innerJoin(
        organizationIntegration,
        and(
          eq(organizationIntegration.organizationId, organization.id),
          eq(organizationIntegration.provider, "slack"),
          eq(organizationIntegration.status, "active")
        )
      )
      .innerJoin(
        organizationSlackIntegration,
        eq(
          organizationSlackIntegration.organizationIntegrationId,
          organizationIntegration.id
        )
      )
      .leftJoin(
        userSlackIntegration,
        and(
          eq(
            userSlackIntegration.organizationIntegrationId,
            organizationIntegration.id
          ),
          eq(userSlackIntegration.userId, userId)
        )
      )
      .where(isNull(organization.deletedAt))
      .pipe(Effect.orDie)
  })
  const disconnectProfile = Effect.fn("Slack.disconnectProfile")(function* () {
    const scope = yield* OrgScope
    const row = yield* connection(scope.organizationId)
    if (!row) return
    yield* db
      .delete(userSlackIntegration)
      .where(
        and(
          eq(userSlackIntegration.organizationIntegrationId, row.id),
          eq(userSlackIntegration.userId, scope.userId)
        )
      )
      .pipe(Effect.orDie)
    yield* db
      .delete(slackOauthState)
      .where(
        and(
          eq(slackOauthState.organizationIntegrationId, row.id),
          eq(slackOauthState.userId, scope.userId)
        )
      )
      .pipe(Effect.orDie)
  })
  const beginOAuth = Effect.fn("Slack.beginOAuth")(function* (
    userId: string,
    orgSlug: string,
    sessionBinding: string
  ) {
    const [org] = yield* db
      .select({ id: organization.id })
      .from(organization)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, organization.id),
          eq(member.userId, userId)
        )
      )
      .where(
        and(eq(organization.slug, orgSlug), isNull(organization.deletedAt))
      )
      .limit(1)
      .pipe(Effect.orDie)
    if (!org) return yield* new NotFound()
    const row = yield* credentials(org.id)
    const state = yield* Effect.sync(() =>
      randomBytes(32).toString("base64url")
    )
    const now = yield* DateTime.nowAsDate
    yield* db
      .delete(slackOauthState)
      .where(
        and(
          eq(slackOauthState.userId, userId),
          eq(slackOauthState.organizationIntegrationId, row.id)
        )
      )
      .pipe(Effect.orDie)
    yield* db
      .insert(slackOauthState)
      .values({
        stateHash: hashSlackState(state),
        organizationIntegrationId: row.id,
        userId,
        sessionHash: hashSlackState(sessionBinding),
        expiresAt: DateTime.toDate(
          DateTime.add(DateTime.makeUnsafe(now), { minutes: 10 })
        )
      })
      .pipe(Effect.orDie)
    const url = new URL("https://slack.com/openid/connect/authorize")
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: row.clientId,
      scope: "openid profile",
      state,
      redirect_uri: redirectUri,
      team: row.teamId
    }))
      url.searchParams.set(key, value)
    return url.toString()
  })
  const completeOAuth = Effect.fn("Slack.completeOAuth")(function* (
    userId: string,
    code: string,
    state: string,
    sessionBinding: string
  ) {
    const now = yield* DateTime.nowAsDate
    const [pending] = yield* db
      .delete(slackOauthState)
      .where(
        and(
          eq(slackOauthState.stateHash, hashSlackState(state)),
          eq(slackOauthState.userId, userId),
          eq(slackOauthState.sessionHash, hashSlackState(sessionBinding)),
          gt(slackOauthState.expiresAt, now)
        )
      )
      .returning()
      .pipe(Effect.orDie)
    if (!pending) return yield* new SlackAuthInvalid()
    const [parent] = yield* db
      .select({ organizationId: organizationIntegration.organizationId })
      .from(organizationIntegration)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, organizationIntegration.organizationId),
          eq(member.userId, userId)
        )
      )
      .where(
        and(
          eq(organizationIntegration.id, pending.organizationIntegrationId),
          eq(organizationIntegration.status, "active")
        )
      )
      .limit(1)
      .pipe(Effect.orDie)
    if (!parent) return yield* new SlackAuthInvalid()
    const row = yield* credentials(parent.organizationId)
    const token = yield* client.exchange({ ...row, code, redirectUri })
    const identity = yield* client.oauthIdentity(token)
    if (
      identity["https://slack.com/team_id"] !== row.teamId ||
      identity.sub !== identity["https://slack.com/user_id"]
    )
      return yield* new SlackAuthInvalid()
    const [inserted] = yield* db
      .insert(userSlackIntegration)
      .values({
        organizationIntegrationId: row.id,
        userId,
        slackUserId: identity.sub,
        displayName: identity.name ?? identity.sub
      })
      .onConflictDoNothing()
      .returning()
      .pipe(Effect.orDie)
    if (!inserted) {
      const [existing] = yield* db
        .select()
        .from(userSlackIntegration)
        .where(
          and(
            eq(userSlackIntegration.organizationIntegrationId, row.id),
            eq(userSlackIntegration.userId, userId),
            eq(userSlackIntegration.slackUserId, identity.sub)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      if (!existing)
        return yield* new Conflict({ reason: "slack_identity_connected" })
    }
  })
  return {
    credentials,
    orgStatus,
    connectOrg,
    disconnectOrg,
    projectStatus,
    channels,
    saveProject,
    disconnectProject,
    testProject,
    profiles,
    disconnectProfile,
    beginOAuth,
    completeOAuth,
    manifest: () => Effect.succeed(makeSlackManifest(baseUrl))
  }
})

export class SlackIntegrations extends Context.Service<
  SlackIntegrations,
  Effect.Success<typeof makeSlackIntegrations>
>()("@pp/integration-slack/Integrations/SlackIntegrations") {
  static readonly layer = Layer.effect(SlackIntegrations, makeSlackIntegrations)
}
