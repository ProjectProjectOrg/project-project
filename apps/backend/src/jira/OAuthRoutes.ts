import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { JiraCredentials } from "@pp/server-core/jira/Credentials"
import { JiraOAuthConfig } from "@pp/server-core/jira/OAuth"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Match from "effect/Match"
import * as Result from "effect/Result"

import { toWebHeaders } from "../http/toWebHeaders"

const requireSession = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const auth = yield* BetterAuth
  return yield* auth
    .getSession(toWebHeaders(request.headers))
    .pipe(Effect.orElseSucceed(() => null))
})

const redirect = (
  publicBaseUrl: string,
  returnPath: string,
  error?: string
) => {
  const url = new URL(returnPath, publicBaseUrl)
  if (error) url.searchParams.set("jiraError", error)
  return HttpServerResponse.redirect(url.toString(), { status: 302 })
}

const startRoute = Effect.gen(function* () {
  const session = yield* requireSession
  if (session === null) {
    return HttpServerResponse.text("Unauthorized", { status: 401 })
  }
  const request = yield* HttpServerRequest.HttpServerRequest
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const returnPath = new URL(webRequest.url).searchParams.get("returnPath")
  if (!returnPath) {
    return HttpServerResponse.text("Missing return path", { status: 400 })
  }
  const credentials = yield* JiraCredentials
  const { authorizeUrl } = yield* credentials.beginConnect(
    session.user.id,
    returnPath
  )
  return HttpServerResponse.redirect(authorizeUrl, { status: 302 })
}).pipe(
  Effect.catchTag("JiraError", () =>
    Effect.gen(function* () {
      const config = yield* JiraOAuthConfig
      return redirect(
        config.publicBaseUrl,
        "/profile",
        "jira_oauth_start_failed"
      )
    })
  ),
  Effect.catchCause(() =>
    Effect.gen(function* () {
      const config = yield* JiraOAuthConfig
      return redirect(
        config.publicBaseUrl,
        "/profile",
        "jira_oauth_start_failed"
      )
    })
  )
)

const callbackRoute = Effect.gen(function* () {
  const session = yield* requireSession
  if (session === null) {
    return HttpServerResponse.text("Unauthorized", { status: 401 })
  }
  const request = yield* HttpServerRequest.HttpServerRequest
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const url = new URL(webRequest.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const config = yield* JiraOAuthConfig
  if (!code || !state) {
    return redirect(
      config.publicBaseUrl,
      "/profile",
      "jira_oauth_callback_invalid"
    )
  }
  const credentials = yield* JiraCredentials
  const returnPath = yield* credentials
    .returnPathForState(session.user.id, state)
    .pipe(Effect.orElseSucceed(() => "/profile"))
  const result = yield* Effect.result(
    credentials.completeConnect(session.user.id, code, state)
  )
  if (Result.isSuccess(result)) {
    return redirect(config.publicBaseUrl, returnPath)
  }
  return redirect(
    config.publicBaseUrl,
    returnPath,
    Match.value(result.failure).pipe(
      Match.tag(
        "JiraReconnectRequired",
        (failure) => `jira_reconnect_${failure.reason}`
      ),
      Match.orElse(() => "jira_oauth_callback_failed")
    )
  )
}).pipe(
  Effect.catchCause(() =>
    Effect.gen(function* () {
      const config = yield* JiraOAuthConfig
      return redirect(
        config.publicBaseUrl,
        "/profile",
        "jira_oauth_callback_failed"
      )
    })
  )
)

export const jiraOauthRoutes = HttpRouter.addAll(
  [
    HttpRouter.route("GET", "/start", startRoute),
    HttpRouter.route("GET", "/callback", callbackRoute)
  ],
  { prefix: "/api/integrations/jira/oauth" }
)
