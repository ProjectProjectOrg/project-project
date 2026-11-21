import { it } from "@effect/vitest"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  oauth2Consent: vi.fn()
}))

import { BetterAuthLive } from "./BetterAuth"
import { AuthInstance } from "./config"

const BetterAuthTest = BetterAuthLive.pipe(
  Layer.provide(
    Layer.succeed(AuthInstance, {
      auth: {
        handler: vi.fn(),
        api: {
          getSession: vi.fn(),
          oauth2Consent: mocks.oauth2Consent
        }
      },
      db: { query: { account: { findFirst: mocks.findFirst } } },
      mcpResource: "http://localhost/mcp",
      toolsResource: "http://localhost/api/v1/tools",
      signInProviders: []
    } as unknown as AuthInstance["Service"])
  )
)

it.effect("passes the HTTP request through when accepting OAuth consent", () =>
  Effect.gen(function* () {
    const request = new Request(
      "http://localhost/api/oauth-applications/consent",
      {
        method: "POST",
        headers: { cookie: "session=fixture" }
      }
    )
    const input = { accept: true, oauth_query: "signed-query" }
    mocks.oauth2Consent.mockResolvedValue({
      url: "http://localhost/callback?code=fixture"
    })

    const result = yield* Effect.gen(function* () {
      const service = yield* BetterAuth.BetterAuth
      return yield* service.submitConsent(request, input)
    }).pipe(Effect.provide(BetterAuthTest))

    expect(mocks.oauth2Consent).toHaveBeenCalledWith({
      asResponse: false,
      request,
      headers: request.headers,
      body: input
    })
    expect(result).toEqual({
      redirectURI: "http://localhost/callback?code=fixture"
    })
  })
)

it.effect("traces each BetterAuth call under its own span", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.gen(function* () {
    const service = yield* BetterAuth.BetterAuth
    yield* service.getOrgSlugById(null)
  }).pipe(
    Effect.withTracer(tracer),
    Effect.provide(BetterAuthTest),
    Effect.map(() =>
      expect(
        spans
          .filter((span) => Option.isNone(span.parent))
          .map((span) => span.name)
      ).toEqual(["BetterAuth.getOrgSlugById"])
    )
  )
})

it.effect("traces submitConsent under its own span", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  mocks.oauth2Consent.mockResolvedValue({ url: "http://localhost/callback" })
  return Effect.gen(function* () {
    const service = yield* BetterAuth.BetterAuth
    yield* service.submitConsent(
      new Request("http://localhost/api/oauth-applications/consent"),
      { accept: true, oauth_query: "signed-query" }
    )
  }).pipe(
    Effect.withTracer(tracer),
    Effect.provide(BetterAuthTest),
    Effect.map(() =>
      expect(
        spans
          .filter((span) => Option.isNone(span.parent))
          .map((span) => span.name)
      ).toEqual(["BetterAuth.submitConsent"])
    )
  )
})
