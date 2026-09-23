import {
  JiraError,
  JiraRateLimited,
  JiraReconnectRequired
} from "@projectproject/shared"
import { createHash } from "node:crypto"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse
} from "effect/unstable/http"

export const JIRA_SCOPES =
  "read:jira-work read:jira-user read:issue-details:jira read:jql:jira read:project:jira read:board-scope:jira-software read:sprint:jira-software offline_access"

export const JIRA_OAUTH_CALLBACK_PATH = "/api/integrations/jira/oauth/callback"

export const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token"

const JiraTokenResponse = Schema.Struct({
  access_token: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  refresh_token: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  expires_in: Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0))),
  scope: Schema.optional(Schema.String),
  token_type: Schema.Literal("Bearer")
})

const JiraTokenErrorResponse = Schema.Struct({ error: Schema.String })

export interface JiraTokenGrant {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: Date
  readonly grantedScopes: ReadonlyArray<string>
}

export type JiraOAuthConfigShape = Readonly<{
  clientId: string
  clientSecret: Redacted.Redacted<string>
  publicBaseUrl: string
  authorizationEndpoint?: string
}>

export class JiraOAuthConfig extends Context.Service<
  JiraOAuthConfig,
  JiraOAuthConfigShape
>()("@projectproject/backend/Jira/OAuth/JiraOAuthConfig") {}

export const JiraOAuthConfigLive = Layer.effect(
  JiraOAuthConfig,
  Effect.all({
    clientId: Config.string("JIRA_CLIENT_ID").pipe(Config.withDefault("")),
    clientSecret: Config.redacted("JIRA_CLIENT_SECRET").pipe(
      Config.withDefault(Redacted.make(""))
    ),
    publicBaseUrl: Config.string("BETTER_AUTH_URL").pipe(
      Config.withDefault("http://localhost:5173")
    )
  })
)

export const jiraRedirectUri = (baseUrl: string): string =>
  new URL(JIRA_OAUTH_CALLBACK_PATH, baseUrl).toString()

export const jiraCodeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url")

export type JiraAuthorizeInput = Readonly<{
  clientId: string
  redirectUri: string
  state: string
  codeVerifier: string
  authorizationEndpoint?: string
}>

export const jiraAuthorizeUrl = (input: JiraAuthorizeInput): string => {
  const url = new URL(
    input.authorizationEndpoint ?? "https://auth.atlassian.com/authorize"
  )
  url.searchParams.set("audience", "api.atlassian.com")
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("scope", JIRA_SCOPES)
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("state", input.state)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("code_challenge", jiraCodeChallenge(input.codeVerifier))
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export const validateReturnPath = (value: string): string | null => {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return null
  const url = new URL(value, "https://projectproject.invalid")
  if (url.origin !== "https://projectproject.invalid") return null
  if (url.pathname.startsWith("/api/integrations/jira/oauth/")) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export const parseTokenGrant = (
  payload: unknown,
  now: DateTime.Utc
): JiraTokenGrant | null => {
  const result = Schema.decodeUnknownExit(JiraTokenResponse)(payload)
  if (result._tag === "Failure") return null
  const token = result.value
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: DateTime.toDate(
      DateTime.add(now, { seconds: token.expires_in })
    ),
    grantedScopes: (token.scope ?? "")
      .split(" ")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0)
  }
}

const requiredScopes = new Set(JIRA_SCOPES.split(" "))

export const hasRequiredScopes = (scopes: ReadonlyArray<string>): boolean => {
  const granted = new Set(scopes)
  return [...requiredScopes].every((scope) => granted.has(scope))
}

export type JiraTokenRejection =
  | "invalid_grant"
  | "transient"
  | "invalid_response"

export const classifyTokenRejection = (
  payload: unknown
): JiraTokenRejection => {
  const result = Schema.decodeUnknownExit(JiraTokenErrorResponse)(payload)
  if (result._tag === "Failure") return "invalid_response"
  return result.value.error === "invalid_grant" ? "invalid_grant" : "transient"
}

export interface JiraTokenEndpointShape {
  readonly exchange: (
    code: string,
    codeVerifier: string | null
  ) => Effect.Effect<
    JiraTokenGrant,
    JiraReconnectRequired | JiraRateLimited | JiraError
  >
  readonly refresh: (
    refreshToken: string
  ) => Effect.Effect<
    JiraTokenGrant,
    JiraReconnectRequired | JiraRateLimited | JiraError
  >
}

export class JiraTokenEndpoint extends Context.Service<
  JiraTokenEndpoint,
  JiraTokenEndpointShape
>()("@projectproject/backend/Jira/OAuth/JiraTokenEndpoint") {}

const requestGrant = Effect.fn("JiraTokenEndpoint.requestGrant")(function* (
  client: HttpClient.HttpClient,
  config: JiraOAuthConfigShape,
  payload: Record<string, string>
) {
  const request = HttpClientRequest.post(JIRA_TOKEN_URL).pipe(
    HttpClientRequest.bodyJsonUnsafe({
      ...payload,
      client_id: config.clientId,
      client_secret: Redacted.value(config.clientSecret)
    })
  )
  const response = yield* client.execute(request).pipe(
    Effect.timeout("20 seconds"),
    Effect.mapError((error) =>
      Predicate.isObject(error) && error._tag === "TimeoutError"
        ? new JiraError({ reason: "timeout" })
        : new JiraError({ reason: "network" })
    )
  )
  if (response.status === 429) {
    const retryAfter = Number(response.headers["retry-after"] ?? "0")
    return yield* new JiraRateLimited({
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0
    })
  }
  if (response.status >= 500) {
    return yield* new JiraError({ reason: "server_error" })
  }
  const body = yield* HttpClientResponse.schemaBodyJson(Schema.Unknown)(
    response
  ).pipe(Effect.mapError(() => new JiraError({ reason: "invalid_response" })))
  if (response.status < 200 || response.status >= 300) {
    const classification = classifyTokenRejection(body)
    if (classification === "invalid_grant") {
      return yield* new JiraReconnectRequired({ reason: "invalid_grant" })
    }
    return yield* new JiraError({
      reason:
        classification === "transient" ? "server_error" : "invalid_response"
    })
  }
  const grant = parseTokenGrant(body, yield* DateTime.now)
  return grant === null
    ? yield* new JiraError({ reason: "invalid_response" })
    : grant
})

export const JiraTokenEndpointLive = Layer.effect(
  JiraTokenEndpoint,
  Effect.gen(function* () {
    const config = yield* JiraOAuthConfig
    const client = yield* HttpClient.HttpClient
    return JiraTokenEndpoint.of({
      exchange: (code, codeVerifier) =>
        requestGrant(client, config, {
          grant_type: "authorization_code",
          code,
          redirect_uri: jiraRedirectUri(config.publicBaseUrl),
          ...(codeVerifier === null ? {} : { code_verifier: codeVerifier })
        }),
      refresh: (refreshToken) =>
        requestGrant(client, config, {
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
    })
  })
)
