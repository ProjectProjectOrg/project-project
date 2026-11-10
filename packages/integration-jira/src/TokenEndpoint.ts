import { JiraError, JiraReconnectRequired } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"

import { rateLimitFromHeaders, type JiraRateLimited } from "./Blocked"
import * as OAuth from "./OAuth"
import * as OAuthConfig from "./OAuthConfig"
import { HEADER_TIMEOUT } from "./Transport"

export class JiraTokenEndpoint extends Context.Service<
  JiraTokenEndpoint,
  Readonly<{
    exchange: (
      code: string,
      codeVerifier: string | null
    ) => Effect.Effect<
      OAuth.JiraTokenGrant,
      JiraReconnectRequired | JiraRateLimited | JiraError
    >
    refresh: (
      refreshToken: string
    ) => Effect.Effect<
      OAuth.JiraTokenGrant,
      JiraReconnectRequired | JiraRateLimited | JiraError
    >
  }>
>()("@pp/integration-jira/TokenEndpoint/JiraTokenEndpoint") {}

const requestGrant = Effect.fn("JiraTokenEndpoint.requestGrant")(function* (
  client: HttpClient.HttpClient,
  config: OAuthConfig.JiraOAuthConfig["Service"],
  payload: Record<string, string>
) {
  const request = HttpClientRequest.post(OAuth.JIRA_TOKEN_URL).pipe(
    HttpClientRequest.bodyJsonUnsafe({
      ...payload,
      client_id: config.clientId,
      client_secret: Redacted.value(config.clientSecret)
    })
  )
  const response = yield* client.execute(request).pipe(
    Effect.timeout(HEADER_TIMEOUT),
    Effect.mapError((error) =>
      Predicate.isTagged(error, "TimeoutError")
        ? new JiraError({ reason: "timeout" })
        : new JiraError({ reason: "network" })
    )
  )
  if (response.status === 429)
    return yield* rateLimitFromHeaders(
      "oauth.token",
      response.headers,
      yield* Clock.currentTimeMillis
    )
  if (response.status >= 500) {
    return yield* new JiraError({
      reason: "server_error",
      status: response.status,
      operation: "oauth.token"
    })
  }
  const body = yield* HttpClientResponse.schemaBodyJson(Schema.Json)(
    response
  ).pipe(
    Effect.timeout(HEADER_TIMEOUT),
    Effect.mapError((error) =>
      Predicate.isTagged(error, "TimeoutError")
        ? new JiraError({ reason: "timeout", operation: "oauth.token" })
        : new JiraError({
            reason: "invalid_json",
            status: response.status,
            operation: "oauth.token"
          })
    )
  )
  if (response.status < 200 || response.status >= 300) {
    const classification = OAuth.classifyTokenRejection(body)
    if (classification === "invalid_grant") {
      return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
    }
    return yield* new JiraError({
      reason:
        classification === "transient" ? "server_error" : "invalid_response",
      status: response.status,
      operation: "oauth.token"
    })
  }
  const grant = OAuth.parseTokenGrant(body, yield* DateTime.now)
  return grant === null
    ? yield* new JiraError({
        reason: "decode_failed",
        status: response.status,
        operation: "oauth.token"
      })
    : grant
})

const make = Effect.gen(function* () {
  const config = yield* OAuthConfig.JiraOAuthConfig
  const client = yield* HttpClient.HttpClient

  const exchange = Effect.fn("JiraTokenEndpoint.exchange")(function* (
    code: string,
    codeVerifier: string | null
  ) {
    return yield* requestGrant(client, config, {
      grant_type: "authorization_code",
      code,
      redirect_uri: OAuth.jiraRedirectUri(config.publicBaseUrl),
      ...(codeVerifier === null ? {} : { code_verifier: codeVerifier })
    })
  })

  const refresh = Effect.fn("JiraTokenEndpoint.refresh")(function* (
    refreshToken: string
  ) {
    return yield* requestGrant(client, config, {
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  })

  return JiraTokenEndpoint.of({ exchange, refresh })
})

export const layer = Layer.effect(JiraTokenEndpoint, make)
