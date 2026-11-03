import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import type * as Schema from "effect/Schema"
import * as Tracer from "effect/Tracer"
import { describe, expect, it } from "vitest"

import * as OAuth from "./OAuth"
import * as OAuthConfig from "./OAuthConfig"
import * as TokenEndpoint from "./TokenEndpoint"

describe("Jira OAuth", () => {
  it("builds the Atlassian authorization URL with the approved contract", () => {
    const url = new URL(
      OAuth.jiraAuthorizeUrl({
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
    expect(url.searchParams.get("scope")).toBe(OAuth.JIRA_SCOPES)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("client_id")).toBe("client-id")
    expect(url.searchParams.get("state")).toBe("state-value")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBe(
      OAuth.jiraCodeChallenge("verifier-value")
    )
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier-value")
  })

  it("can direct a disposable harness to its local authorization page", () => {
    const url = new URL(
      OAuth.jiraAuthorizeUrl({
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
    expect(OAuth.JIRA_OAUTH_CALLBACK_PATH).toBe(
      "/api/integrations/jira/oauth/callback"
    )
    expect(OAuth.jiraRedirectUri("https://app.example/base")).toBe(
      "https://app.example/api/integrations/jira/oauth/callback"
    )
  })

  it.each([
    ["/profile", "/profile"],
    ["/orgs/acme/projects", "/orgs/acme/projects"],
    ["/path?tab=jira#connect", "/path?tab=jira#connect"]
  ])("accepts an internal return path", (input, expected) => {
    expect(OAuth.validateReturnPath(input)).toBe(expected)
  })

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "profile",
    "/api/integrations/jira/oauth/callback",
    "/\\evil",
    "/%2f%2fevil.example"
  ])("rejects unsafe return path %s", (input) => {
    expect(OAuth.validateReturnPath(input)).toBeNull()
  })

  it("decodes a rotating token response", () => {
    const now = DateTime.makeUnsafe("2026-09-14T12:00:00Z")
    const grant = OAuth.parseTokenGrant(
      {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: OAuth.JIRA_SCOPES,
        token_type: "Bearer"
      },
      now
    )

    expect(grant).not.toBeNull()
    expect(grant?.accessToken).toBe("access-token")
    expect(grant?.refreshToken).toBe("refresh-token")
    expect(grant?.grantedScopes).toEqual(OAuth.JIRA_SCOPES.split(" "))
    expect(grant?.expiresAt.toISOString()).toBe("2026-09-14T13:00:00.000Z")
  })

  const malformedGrants: ReadonlyArray<Schema.Json> = [
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
  ]
  it.each(malformedGrants)("rejects malformed token payloads", (payload) => {
    expect(
      OAuth.parseTokenGrant(
        payload,
        DateTime.makeUnsafe("2026-09-14T12:00:00Z")
      )
    ).toBeNull()
  })

  it("requires every approved scope", () => {
    expect(OAuth.hasRequiredScopes(OAuth.JIRA_SCOPES.split(" "))).toBe(true)
    expect(
      OAuth.hasRequiredScopes(
        OAuth.JIRA_SCOPES.split(" ").filter(
          (scope) => scope !== "offline_access"
        )
      )
    ).toBe(false)
  })

  it("classifies only invalid_grant as requiring reconnection", () => {
    expect(OAuth.classifyTokenRejection({ error: "invalid_grant" })).toBe(
      "invalid_grant"
    )
    expect(
      OAuth.classifyTokenRejection({ error: "temporarily_unavailable" })
    ).toBe("transient")
    expect(OAuth.classifyTokenRejection({ error_description: "secret" })).toBe(
      "invalid_response"
    )
  })
})

const recordSpans = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return { spans, tracer }
}

const tokenEndpointLayer = TokenEndpoint.layer.pipe(
  Layer.provide(
    Layer.succeed(OAuthConfig.JiraOAuthConfig, {
      clientId: "jira-client",
      clientSecret: Redacted.make("jira-secret"),
      publicBaseUrl: "https://app.example"
    })
  ),
  Layer.provide(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              access_token: "access",
              refresh_token: "refresh",
              expires_in: 3600,
              scope: OAuth.JIRA_SCOPES,
              token_type: "Bearer"
            })
          )
        )
      )
    )
  )
)

const exchangeAndRefresh = Effect.gen(function* () {
  const tokens = yield* TokenEndpoint.JiraTokenEndpoint
  yield* tokens.exchange("code", "verifier")
  yield* tokens.refresh("refresh")
})

describe("JiraTokenEndpoint tracing", () => {
  it("pins the token request span that already existed", async () => {
    const { spans, tracer } = recordSpans()
    await Effect.runPromise(
      exchangeAndRefresh.pipe(
        Effect.withTracer(tracer),
        Effect.provide(tokenEndpointLayer)
      )
    )
    expect(
      spans.filter((span) => span.name === "JiraTokenEndpoint.requestGrant")
    ).toHaveLength(2)
  })

  it("traces exchange and refresh around the token request", async () => {
    const { spans, tracer } = recordSpans()
    await Effect.runPromise(
      exchangeAndRefresh.pipe(
        Effect.withTracer(tracer),
        Effect.provide(tokenEndpointLayer)
      )
    )
    const jiraSpans = spans.filter((span) =>
      span.name.startsWith("JiraTokenEndpoint.")
    )
    expect(
      jiraSpans.map((span) => ({
        name: span.name,
        parent: Option.match(span.parent, {
          onNone: () => null,
          onSome: (parent) =>
            parent._tag === "Span" ? parent.name : parent.spanId
        })
      }))
    ).toEqual([
      { name: "JiraTokenEndpoint.exchange", parent: null },
      {
        name: "JiraTokenEndpoint.requestGrant",
        parent: "JiraTokenEndpoint.exchange"
      },
      { name: "JiraTokenEndpoint.refresh", parent: null },
      {
        name: "JiraTokenEndpoint.requestGrant",
        parent: "JiraTokenEndpoint.refresh"
      }
    ])
  })
})
