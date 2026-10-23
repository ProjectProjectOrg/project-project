import {
  SlackAuthInvalid,
  SlackChannelId,
  SlackError,
  SlackRateLimited
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export type SlackCallError = SlackAuthInvalid | SlackError | SlackRateLimited
export type SlackMessage = Readonly<{
  text: string
  blocks: ReadonlyArray<
    Readonly<{
      type: "section" | "context"
      text?: Readonly<{ type: "plain_text" | "mrkdwn"; text: string }>
      elements?: ReadonlyArray<Readonly<{ type: "plain_text"; text: string }>>
    }>
  >
}>
export type SlackUnfurl = Pick<SlackMessage, "blocks">
type UnfurlTarget = Readonly<
  { channel: string; ts: string } | { unfurl_id: string; source: string }
>

const Identity = Schema.Struct({
  team_id: Schema.NonEmptyString,
  team: Schema.String,
  user_id: Schema.NonEmptyString,
  bot_id: Schema.NonEmptyString
})
const Channel = Schema.Struct({
  id: SlackChannelId,
  name: Schema.String,
  is_member: Schema.Boolean,
  is_archived: Schema.Boolean
})
const ChannelPage = Schema.Struct({
  channels: Schema.Array(Channel),
  response_metadata: Schema.optional(
    Schema.Struct({ next_cursor: Schema.optional(Schema.String) })
  )
})
const OAuthIdentity = Schema.Struct({
  sub: Schema.NonEmptyString,
  "https://slack.com/user_id": Schema.NonEmptyString,
  "https://slack.com/team_id": Schema.NonEmptyString,
  name: Schema.optional(Schema.String)
})
const Envelope = Schema.Struct({
  ok: Schema.Boolean,
  error: Schema.optional(Schema.String)
})

export class SlackClient extends Context.Service<
  SlackClient,
  Readonly<{
    identity: (
      token: string
    ) => Effect.Effect<typeof Identity.Type, SlackCallError>
    appId: (
      token: string,
      botId: string
    ) => Effect.Effect<string, SlackCallError>
    socketUrl: (token: string) => Effect.Effect<string, SlackCallError>
    channels: (
      token: string,
      cursor: string
    ) => Effect.Effect<typeof ChannelPage.Type, SlackCallError>
    channel: (
      token: string,
      id: string
    ) => Effect.Effect<typeof Channel.Type, SlackCallError>
    send: (
      token: string,
      channel: string,
      id: string,
      message: SlackMessage
    ) => Effect.Effect<void, SlackCallError>
    unfurl: (
      token: string,
      target: UnfurlTarget,
      previews: Readonly<Record<string, SlackUnfurl>>
    ) => Effect.Effect<void, SlackCallError>
    promptToConnect: (
      token: string,
      target: UnfurlTarget,
      connectUrl: string
    ) => Effect.Effect<void, SlackCallError>
    exchange: (
      input: Readonly<{
        clientId: string
        clientSecret: string
        code: string
        redirectUri: string
      }>
    ) => Effect.Effect<string, SlackCallError>
    oauthIdentity: (
      token: string
    ) => Effect.Effect<typeof OAuthIdentity.Type, SlackCallError>
  }>
>()("@pp/integration-slack/Client/SlackClient") {
  static readonly layer = Layer.effect(
    SlackClient,
    Effect.gen(function* () {
      const fetch = yield* FetchHttpClient.Fetch
      const request = Effect.fn("Slack.request")(
        function* <S extends Schema.ConstraintDecoder<unknown>>(
          token: string,
          method: string,
          body: Readonly<Record<string, unknown>>,
          schema: S,
          form = false
        ) {
          const encodedBody = form
            ? new URLSearchParams(
                Object.fromEntries(
                  Object.entries(body).map(([key, value]) => [
                    key,
                    String(value)
                  ])
                )
              ).toString()
            : yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
                body
              ).pipe(
                Effect.mapError(
                  () => new SlackError({ reason: "invalid_request" })
                )
              )
          const response = yield* Effect.tryPromise({
            try: (signal) =>
              fetch(`https://slack.com/api/${method}`, {
                method: "POST",
                signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  "Content-Type": form
                    ? "application/x-www-form-urlencoded"
                    : "application/json; charset=utf-8"
                },
                body: encodedBody
              }),
            catch: () => new SlackError({ reason: "connection" })
          })
          if (response.status === 429) {
            const seconds = Number(response.headers.get("retry-after"))
            return yield* new SlackRateLimited({
              retryAfterSeconds:
                Number.isFinite(seconds) && seconds > 0 ? seconds : 60
            })
          }
          if (!response.ok)
            return yield* new SlackError({
              reason:
                response.status >= 500 ? "unavailable" : "request_rejected"
            })
          const json: unknown = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: () => new SlackError({ reason: "invalid_response" })
          })
          const envelope = yield* Schema.decodeUnknownEffect(Envelope)(
            json
          ).pipe(
            Effect.mapError(
              () => new SlackError({ reason: "invalid_response" })
            )
          )
          if (!envelope.ok) {
            const reason = envelope.error ?? "request_rejected"
            if (
              [
                "invalid_auth",
                "not_authed",
                "token_revoked",
                "token_expired",
                "account_inactive"
              ].includes(reason)
            )
              return yield* new SlackAuthInvalid()
            if (reason === "ratelimited")
              return yield* new SlackRateLimited({ retryAfterSeconds: 60 })
            return yield* new SlackError({
              reason: /^[a-z_]+$/.test(reason) ? reason : "request_rejected"
            })
          }
          return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
            Effect.mapError(
              () => new SlackError({ reason: "invalid_response" })
            )
          )
        },
        (effect, _token, method) =>
          effect.pipe(
            Effect.tapError((error) =>
              Effect.logWarning("Slack API request failed", {
                method,
                error: error._tag,
                ...(error._tag === "SlackError" ? { reason: error.reason } : {})
              })
            )
          )
      )
      return SlackClient.of({
        identity: (token) => request(token, "auth.test", {}, Identity),
        appId: (token, bot) =>
          request(
            token,
            "bots.info",
            { bot },
            Schema.Struct({
              bot: Schema.Struct({ app_id: Schema.NonEmptyString })
            }),
            true
          ).pipe(Effect.map((r) => r.bot.app_id)),
        socketUrl: (token) =>
          request(
            token,
            "apps.connections.open",
            {},
            Schema.Struct({
              url: Schema.String.check(Schema.isPattern(/^wss:\/\//))
            })
          ).pipe(Effect.map((r) => r.url)),
        channels: (token, cursor) =>
          request(
            token,
            "conversations.list",
            {
              types: "public_channel,private_channel",
              exclude_archived: true,
              limit: 200,
              cursor
            },
            ChannelPage,
            true
          ),
        channel: (token, channel) =>
          request(
            token,
            "conversations.info",
            { channel },
            Schema.Struct({ channel: Channel }),
            true
          ).pipe(Effect.map((r) => r.channel)),
        send: (token, channel, id, message) =>
          request(
            token,
            "chat.postMessage",
            {
              channel,
              client_msg_id: id,
              ...message,
              unfurl_links: false,
              unfurl_media: false
            },
            Envelope
          ).pipe(Effect.asVoid),
        unfurl: (token, target, unfurls) =>
          request(token, "chat.unfurl", { ...target, unfurls }, Envelope).pipe(
            Effect.asVoid
          ),
        promptToConnect: (token, target, connectUrl) =>
          request(
            token,
            "chat.unfurl",
            {
              ...target,
              user_auth_message: `<${connectUrl}|Connect PP to show previews>\nConnect your Slack account once so ProjectProject can check your ticket access. Previews are visible to everyone in the conversation.`
            },
            Envelope
          ).pipe(Effect.asVoid),
        exchange: ({ clientId, clientSecret, code, redirectUri }) =>
          request(
            "",
            "openid.connect.token",
            {
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_uri: redirectUri,
              grant_type: "authorization_code"
            },
            Schema.Struct({ access_token: Schema.NonEmptyString }),
            true
          ).pipe(Effect.map((r) => r.access_token)),
        oauthIdentity: (token) =>
          request(token, "openid.connect.userInfo", {}, OAuthIdentity)
      })
    })
  )
}
