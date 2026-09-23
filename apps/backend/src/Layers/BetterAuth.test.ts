import { it } from "@effect/vitest"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import * as Effect from "effect/Effect"
import { beforeEach, describe, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  oauth2Consent: vi.fn()
}))

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    query: {
      account: {
        findFirst: mocks.findFirst
      }
    }
  }))
}))

vi.mock("../auth", () => ({
  auth: {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(),
      oauth2Consent: mocks.oauth2Consent
    }
  }
}))

import { BetterAuthLive } from "./BetterAuth"

describe("BetterAuthLive getPersonalGithub", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset()
  })

  it.effect("returns connected when the user has a GitHub account row", () =>
    Effect.gen(function* () {
      mocks.findFirst.mockResolvedValue({ id: "account-1" })

      const result = yield* runGetPersonalGithub("user-1")

      expect(result).toEqual({ connected: true })
      expect(mocks.findFirst).toHaveBeenCalledOnce()
    })
  )

  it.effect(
    "returns disconnected when the user has no GitHub account row",
    () =>
      Effect.gen(function* () {
        mocks.findFirst.mockResolvedValue(undefined)

        const result = yield* runGetPersonalGithub("user-1")

        expect(result).toEqual({ connected: false })
        expect(mocks.findFirst).toHaveBeenCalledOnce()
      })
  )
})

const runGetPersonalGithub = (userId: string) =>
  Effect.gen(function* () {
    const service = yield* BetterAuth
    return yield* service.getPersonalGithub(userId)
  }).pipe(Effect.provide(BetterAuthLive))

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
      const service = yield* BetterAuth
      return yield* service.submitConsent(request, input)
    }).pipe(Effect.provide(BetterAuthLive))

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
