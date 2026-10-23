import {
  SlackIntegrations,
  slackCallbackPath,
  slackPublicUrl
} from "@pp/integration-slack/Integrations"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"

import { toWebHeaders } from "../http/toWebHeaders"

const Callback = Schema.Struct({
  code: Schema.NonEmptyString,
  state: Schema.NonEmptyString
})
const Start = Schema.Struct({ orgSlug: Schema.NonEmptyString })
const profileRedirect = (failed: boolean) =>
  Effect.gen(function* () {
    const baseUrl = yield* slackPublicUrl.pipe(Effect.orDie)
    const url = new URL("/profile/connections", baseUrl)
    if (failed) url.searchParams.set("slackError", "oauth_failed")
    return HttpServerResponse.redirect(url.toString(), { status: 303 })
  })
const session = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const auth = yield* BetterAuth
  const current = yield* auth.getSession(toWebHeaders(request.headers))
  const binding = (request.headers.cookie ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => /^(?:__Secure-)?better-auth\.session_token=/.test(cookie))
  return current && binding ? { userId: current.user.id, binding } : null
})
const start = Effect.gen(function* () {
  const { orgSlug } = yield* HttpServerRequest.schemaSearchParams(Start)
  const current = yield* session
  if (!current) {
    const baseUrl = yield* slackPublicUrl
    const loginUrl = new URL("/login", baseUrl)
    const startUrl = new URL("/api/integrations/slack/oauth/start", baseUrl)
    startUrl.searchParams.set("orgSlug", orgSlug)
    loginUrl.searchParams.set(
      "redirect",
      `${startUrl.pathname}${startUrl.search}`
    )
    return HttpServerResponse.redirect(loginUrl.toString(), { status: 303 })
  }
  const url = yield* (yield* SlackIntegrations).beginOAuth(
    current.userId,
    orgSlug,
    current.binding
  )
  return HttpServerResponse.redirect(url, { status: 302 })
}).pipe(Effect.catchCause(() => profileRedirect(true)))
const callback = Effect.gen(function* () {
  const current = yield* session
  if (!current) return HttpServerResponse.empty({ status: 401 })
  const params = yield* HttpServerRequest.schemaSearchParams(Callback)
  yield* (yield* SlackIntegrations).completeOAuth(
    current.userId,
    params.code,
    params.state,
    current.binding
  )
  return yield* profileRedirect(false)
}).pipe(Effect.catchCause(() => profileRedirect(true)))

const postCallback = Effect.gen(function* () {
  const params = yield* HttpServerRequest.schemaBodyUrlParams(Callback)
  const baseUrl = yield* slackPublicUrl.pipe(Effect.orDie)
  const url = new URL(slackCallbackPath, baseUrl)
  url.searchParams.set("code", params.code)
  url.searchParams.set("state", params.state)
  return HttpServerResponse.redirect(url.toString(), { status: 303 })
}).pipe(Effect.catchCause(() => profileRedirect(true)))

export const slackOAuthRoutes = HttpRouter.addAll(
  [
    HttpRouter.route("GET", "/start", start),
    HttpRouter.route("GET", "/callback", callback),
    HttpRouter.route("POST", "/callback", postCallback)
  ],
  { prefix: "/api/integrations/slack/oauth" }
)
