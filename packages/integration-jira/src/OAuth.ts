// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

export const JIRA_SCOPES =
  "read:jira-work read:jira-user read:issue-details:jira read:jql:jira read:project:jira read:board-scope:jira-software read:board-scope.admin:jira-software read:sprint:jira-software offline_access"

export const JIRA_OAUTH_CALLBACK_PATH = "/api/integrations/jira/oauth/callback"

export const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token"

const JiraTokenResponse = Schema.Struct({
  access_token: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  refresh_token: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  expires_in: Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0))),
  scope: Schema.optional(Schema.String),
  token_type: Schema.Literal("Bearer")
})

const decodeUnknownJiraTokenResponseExit =
  Schema.decodeUnknownExit(JiraTokenResponse)

const JiraTokenErrorResponse = Schema.Struct({ error: Schema.String })

const decodeUnknownJiraTokenErrorResponseExit = Schema.decodeUnknownExit(
  JiraTokenErrorResponse
)

export type JiraTokenGrant = Readonly<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
  grantedScopes: ReadonlyArray<string>
}>

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
  payload: Schema.Json,
  now: DateTime.Utc
): JiraTokenGrant | null => {
  const result = decodeUnknownJiraTokenResponseExit(payload)
  if (Exit.isFailure(result)) return null
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
  payload: Schema.Json
): JiraTokenRejection => {
  const result = decodeUnknownJiraTokenErrorResponseExit(payload)
  if (Exit.isFailure(result)) return "invalid_response"
  return result.value.error === "invalid_grant" ? "invalid_grant" : "transient"
}
