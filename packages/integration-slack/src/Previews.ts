import { Db } from "@pp/db"
import {
  organization,
  organizationIntegration,
  userSlackIntegration
} from "@pp/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { SlackClient, type SlackUnfurl } from "./Client"
import { SlackHost } from "./Host"
import { SlackIntegrations, slackPublicUrl } from "./Integrations"
import { parseTicketLink, ticketPreview } from "./messages"

const SharedLink = Schema.Struct({
  team_id: Schema.NonEmptyString,
  api_app_id: Schema.NonEmptyString,
  event: Schema.Struct({
    type: Schema.Literal("link_shared"),
    user: Schema.NonEmptyString,
    channel: Schema.optional(Schema.String),
    message_ts: Schema.optional(Schema.String),
    unfurl_id: Schema.optional(Schema.String),
    source: Schema.optional(
      Schema.Literals(["composer", "conversations_history"])
    ),
    links: Schema.Array(Schema.Struct({ url: Schema.String }))
  })
})

const decodeUnknownSharedLinkOption = Schema.decodeUnknownOption(SharedLink)

export const makeSlackPreviews = Effect.gen(function* () {
  const db = yield* Db
  const host = yield* SlackHost
  const integrations = yield* SlackIntegrations
  const client = yield* SlackClient
  const baseUrl = yield* slackPublicUrl
  const handle = Effect.fn("Slack.preview")(function* (
    organizationId: string,
    body: unknown
  ) {
    const decoded = decodeUnknownSharedLinkOption(body)
    if (Option.isNone(decoded)) return
    const row = yield* integrations.credentials(organizationId)
    const { event, team_id, api_app_id } = decoded.value
    if (row.teamId !== team_id || row.appId !== api_app_id) return
    const target =
      event.unfurl_id && event.source
        ? { unfurl_id: event.unfurl_id, source: event.source }
        : event.channel && event.message_ts
          ? { channel: event.channel, ts: event.message_ts }
          : null
    if (!target) return
    const [viewer] = yield* db
      .select({
        orgSlug: organization.slug,
        userId: userSlackIntegration.userId
      })
      .from(organization)
      .leftJoin(
        userSlackIntegration,
        and(
          eq(userSlackIntegration.organizationIntegrationId, row.id),
          eq(userSlackIntegration.slackUserId, event.user)
        )
      )
      .where(
        and(eq(organization.id, organizationId), isNull(organization.deletedAt))
      )
      .limit(1)
      .pipe(Effect.orDie)
    if (!viewer) return
    if (!viewer.userId) {
      if (
        !event.links.some(
          ({ url }) => parseTicketLink(baseUrl, url)?.orgSlug === viewer.orgSlug
        )
      )
        return
      const connectUrl = new URL("/api/integrations/slack/oauth/start", baseUrl)
      connectUrl.searchParams.set("orgSlug", viewer.orgSlug)
      yield* client.promptToConnect(row.botToken, target, connectUrl.toString())
      return
    }
    const unfurls: Record<string, SlackUnfurl> = {}
    for (const { url } of event.links.slice(0, 5)) {
      const ticket = parseTicketLink(baseUrl, url)
      if (!ticket) continue
      const summary = yield* host.ticketSummary({
        ...ticket,
        userId: viewer.userId,
        organizationId
      })
      if (!summary) continue
      unfurls[url] = ticketPreview(summary)
    }
    if (Object.keys(unfurls).length === 0) return
    const [stillConnected] = yield* db
      .select({ id: organizationIntegration.id })
      .from(organizationIntegration)
      .innerJoin(
        organization,
        eq(organization.id, organizationIntegration.organizationId)
      )
      .where(
        and(
          eq(organizationIntegration.id, row.id),
          eq(organizationIntegration.status, "active"),
          isNull(organization.deletedAt)
        )
      )
      .limit(1)
      .pipe(Effect.orDie)
    if (!stillConnected) return
    yield* client.unfurl(row.botToken, target, unfurls)
  })
  return { handle }
})

export class SlackPreviews extends Context.Service<
  SlackPreviews,
  Effect.Success<typeof makeSlackPreviews>
>()("@pp/integration-slack/Previews/SlackPreviews") {
  static readonly layer = Layer.effect(SlackPreviews, makeSlackPreviews)
}
