import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  JIRA_OAUTH_CALLBACK_PATH,
  JIRA_SCOPES,
  classifyTokenRejection,
  hasRequiredScopes,
  jiraAuthorizeUrl,
  jiraCodeChallenge,
  jiraRedirectUri,
  parseTokenGrant,
  validateReturnPath
} from "./OAuth"

describe("Jira OAuth", () => {
  it("builds the Atlassian authorization URL with the approved contract", () => {
    const url = new URL(
      jiraAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "https://app.example/api/integrations/jira/oauth/callback",
        state: "state-value",
        codeVerifier: "verifier-value"
      })
    )

    expect(url.origin + url.pathname).toBe(
      "https://auth.atlassian.com/authorize"
    )
    expect(url.searchParams.get("audience")).toBe("api.atlassian.com")
    expect(url.searchParams.get("scope")).toBe(JIRA_SCOPES)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("client_id")).toBe("client-id")
    expect(url.searchParams.get("state")).toBe("state-value")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBe(
      jiraCodeChallenge("verifier-value")
    )
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier-value")
  })

  it("can direct a disposable harness to its local authorization page", () => {
    const url = new URL(
      jiraAuthorizeUrl({
        clientId: "fixture-client",
        redirectUri:
          "http://localhost:5173/api/integrations/jira/oauth/callback",
        state: "state-value",
        codeVerifier: "verifier-value",
        authorizationEndpoint: "http://127.0.0.1:3000/__jira-harness/authorize"
      })
    )

    expect(url.origin + url.pathname).toBe(
      "http://127.0.0.1:3000/__jira-harness/authorize"
    )
    expect(url.searchParams.get("state")).toBe("state-value")
  })

  it("uses the exact callback path", () => {
    expect(JIRA_OAUTH_CALLBACK_PATH).toBe(
      "/api/integrations/jira/oauth/callback"
    )
    expect(jiraRedirectUri("https://app.example/base")).toBe(
      "https://app.example/api/integrations/jira/oauth/callback"
    )
  })

  it.each([
    ["/profile", "/profile"],
    ["/orgs/acme/projects", "/orgs/acme/projects"],
    ["/path?tab=jira#connect", "/path?tab=jira#connect"]
  ])("accepts an internal return path", (input, expected) => {
    expect(validateReturnPath(input)).toBe(expected)
  })

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "profile",
    "/api/integrations/jira/oauth/callback",
    "/\\evil",
    "/%2f%2fevil.example"
  ])("rejects unsafe return path %s", (input) => {
    expect(validateReturnPath(input)).toBeNull()
  })

  it("decodes a rotating token response", () => {
    const now = DateTime.makeUnsafe("2026-09-14T12:00:00Z")
    const grant = parseTokenGrant(
      {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: JIRA_SCOPES,
        token_type: "Bearer"
      },
      now
    )

    expect(grant).not.toBeNull()
    expect(grant?.accessToken).toBe("access-token")
    expect(grant?.refreshToken).toBe("refresh-token")
    expect(grant?.grantedScopes).toEqual(JIRA_SCOPES.split(" "))
    expect(grant?.expiresAt.toISOString()).toBe("2026-09-14T13:00:00.000Z")
  })

  it.each([
    {},
    { access_token: "", refresh_token: "refresh", expires_in: 1 },
    { access_token: "access", refresh_token: "", expires_in: 1 },
    { access_token: "access", refresh_token: "refresh", expires_in: 0 },
    {
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 1,
      token_type: "Basic"
    }
  ])("rejects malformed token payloads", (payload) => {
    expect(
      parseTokenGrant(payload, DateTime.makeUnsafe("2026-09-14T12:00:00Z"))
    ).toBeNull()
  })

  it("requires every approved scope", () => {
    expect(hasRequiredScopes(JIRA_SCOPES.split(" "))).toBe(true)
    expect(
      hasRequiredScopes(
        JIRA_SCOPES.split(" ").filter((scope) => scope !== "offline_access")
      )
    ).toBe(false)
  })

  it("classifies only invalid_grant as requiring reconnection", () => {
    expect(classifyTokenRejection({ error: "invalid_grant" })).toBe(
      "invalid_grant"
    )
    expect(classifyTokenRejection({ error: "temporarily_unavailable" })).toBe(
      "transient"
    )
    expect(classifyTokenRejection({ error_description: "secret" })).toBe(
      "invalid_response"
    )
  })
})
