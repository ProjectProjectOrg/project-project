import { it } from "@effect/vitest"
import { appProtocolVersion } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as TestClock from "effect/testing/TestClock"
import { FetchHttpClient } from "effect/unstable/http"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { describe, expect } from "vitest"

import { ViewCacheLive } from "@/cache/ViewCache"
import { MemoryStorageLive } from "@/servers/memoryStorage"
import type { SavedServer } from "@/servers/model"
import { ServerStore, ServerStoreLive } from "@/servers/ServerStore"

import { authorizationCode, authorizeUrl } from "./oauth"
import { AuthBrowser, PkceSource } from "./ports"
import { authTimeout } from "./ServerAuth"
import { ServerAuth } from "./ServerAuth"

const origin = "https://pp.example"

const server: SavedServer = {
  instanceId: "instance-1",
  origin,
  name: "Igne",
  logo: null,
  protocolVersion: appProtocolVersion,
  user: null,
  orgs: []
}

const pkce = { verifier: "verifier", challenge: "challenge", state: "state-1" }

type Call = Readonly<{
  url: string
  body: string
  authorization: string | null
}>

type Json =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<Json>
  | Readonly<{ [key: string]: Json }>

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })

const fakeServer = (
  options: Readonly<{
    instanceId?: string
    token?: (
      body: URLSearchParams,
      attempt: number
    ) => Response | Promise<Response>
    browser?: (url: string) => Option.Option<string>
    me?: () => Response
    revoke?: () => Promise<Response>
  }> = {}
) => {
  const calls: Array<Call> = []
  let tokenAttempts = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const body = await request.text()
    calls.push({
      url: url.pathname,
      body,
      authorization: request.headers.get("authorization")
    })
    switch (url.pathname) {
      case "/api/instance":
        return json({
          instanceId: options.instanceId ?? server.instanceId,
          name: "Igne",
          logo: null,
          serverVersion: "dev",
          protocolVersion: appProtocolVersion
        })
      case "/api/auth/oauth2/token":
        tokenAttempts += 1
        return (
          options.token ??
          (() =>
            json({
              access_token: "access-1",
              refresh_token: "refresh-1",
              expires_in: 3600
            }))
        )(new URLSearchParams(body), tokenAttempts)
      case "/api/me":
        if (options.me !== undefined) return options.me()
        return json({
          id: "user-1",
          email: "luuk@igne.nl",
          name: "Luuk",
          username: null,
          image: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          activeOrgSlug: "igne",
          personalGithub: { connected: false },
          editorPreference: "github",
          personalEverhour: {
            connected: false,
            everhourUserId: null,
            name: null,
            email: null,
            lastVerifiedAt: null,
            lastCheckError: null
          }
        })
      case "/api/auth/oauth2/revoke":
        return (options.revoke ?? (async () => json({})))()
      case "/api/orgs":
        return json([{ slug: "igne", name: "Igne", role: "owner" }])
      default:
        return json({}, 401)
    }
  }
  const layer = ServerAuth.layer.pipe(
    Layer.provideMerge(Layer.merge(ServerStoreLive, ViewCacheLive)),
    Layer.provideMerge(MemoryStorageLive),
    Layer.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(
            FetchHttpClient.Fetch,
            Object.assign(fetch, { preconnect: () => {} })
          )
        )
      )
    ),
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(AuthBrowser, {
          authorize: (url) =>
            Effect.succeed(
              (
                options.browser ??
                (() =>
                  Option.some(
                    `projectproject://oauth/callback?code=code-1&state=${pkce.state}`
                  ))
              )(url)
            )
        }),
        Layer.succeed(PkceSource, { create: Effect.succeed(pkce) }),
        Reactivity.layer
      )
    )
  )
  return { calls, layer }
}

const withSavedServer = Effect.gen(function* () {
  const store = yield* ServerStore
  yield* store.save(server)
  return store
})

describe("authorize request", () => {
  it("asks for the app client, PKCE S256, state and the /api resource", () => {
    const params = new URL(authorizeUrl(origin, pkce)).searchParams
    expect(Object.fromEntries(params)).toEqual({
      response_type: "code",
      client_id: "projectproject-app",
      redirect_uri: "projectproject://oauth/callback",
      scope: "openid profile email offline_access",
      state: "state-1",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      resource: "https://pp.example/api"
    })
  })

  it("only accepts the app's own redirect", () => {
    expect(
      authorizationCode(
        "https://evil.example/oauth/callback?code=c&state=state-1",
        "state-1"
      )
    ).toMatchObject({ failure: { reason: "bad_redirect" } })
    expect(authorizationCode("not a url", "state-1")).toMatchObject({
      failure: { reason: "bad_redirect" }
    })
  })

  it("only accepts a callback carrying the state it sent", () => {
    expect(
      authorizationCode(
        "projectproject://oauth/callback?code=c&state=other",
        "state-1"
      )
    ).toMatchObject({
      failure: { reason: "state_mismatch" }
    })
    expect(
      authorizationCode(
        "projectproject://oauth/callback?error=access_denied&state=state-1",
        "state-1"
      )
    ).toMatchObject({ failure: { reason: "denied" } })
  })
})

it.effect("signs in, keeps the tokens and caches the account", () => {
  const fake = fakeServer()
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)

    const exchange = new URLSearchParams(
      fake.calls.find((call) => call.url === "/api/auth/oauth2/token")?.body
    )
    expect(Object.fromEntries(exchange)).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier",
      client_id: "projectproject-app",
      resource: "https://pp.example/api"
    })
    expect(yield* store.tokens(server.instanceId)).toEqual(
      Option.some({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: 3_600_000
      })
    )
    const [saved] = yield* store.list
    expect(saved?.user?.email).toBe("luuk@igne.nl")
    expect(saved?.orgs).toEqual([{ slug: "igne", name: "Igne" }])
    expect(yield* store.lastUsedOrg).toEqual(
      Option.some({ instanceId: server.instanceId, orgSlug: "igne" })
    )
    expect(
      fake.calls.find((call) => call.url === "/api/me")?.authorization
    ).toBe("Bearer access-1")
  }).pipe(Effect.provide(fake.layer))
})

it.effect(
  "stops before sending anything when the address now answers as another instance",
  () => {
    const fake = fakeServer({ instanceId: "someone-else" })
    return Effect.gen(function* () {
      yield* withSavedServer
      const auth = yield* ServerAuth
      const error = yield* Effect.flip(auth.signIn(server.instanceId))
      expect(error._tag).toBe("InstanceChanged")
      expect(fake.calls.map((call) => call.url)).toEqual(["/api/instance"])
    }).pipe(Effect.provide(fake.layer))
  }
)

it.effect("treats a closed sheet as cancelled", () => {
  const fake = fakeServer({ browser: () => Option.none() })
  return Effect.gen(function* () {
    yield* withSavedServer
    const auth = yield* ServerAuth
    expect((yield* Effect.flip(auth.signIn(server.instanceId)))._tag).toBe(
      "SignInCancelled"
    )
  }).pipe(Effect.provide(fake.layer))
})

it.effect(
  "refreshes once for concurrent callers and retries a dropped connection",
  () => {
    const fake = fakeServer({
      token: (body, attempt) => {
        if (body.get("grant_type") !== "refresh_token") {
          return json({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 60
          })
        }
        if (attempt === 2)
          return Promise.reject(new TypeError("Network request failed"))
        return json({
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 3600
        })
      }
    })
    return Effect.gen(function* () {
      yield* withSavedServer
      const auth = yield* ServerAuth
      yield* auth.signIn(server.instanceId)
      yield* TestClock.adjust("1 minute")
      const tokens = yield* Effect.all(
        [
          auth.accessToken(server.instanceId),
          auth.accessToken(server.instanceId)
        ],
        { concurrency: "unbounded" }
      )
      expect(tokens).toEqual(["access-2", "access-2"])
      const refreshes = fake.calls.filter(
        (call) =>
          new URLSearchParams(call.body).get("grant_type") === "refresh_token"
      )
      expect(refreshes.length).toBe(2)
    }).pipe(Effect.provide(fake.layer))
  }
)

it.effect("signs out when the refresh token is refused", () => {
  const fake = fakeServer({
    token: (body) =>
      body.get("grant_type") === "refresh_token"
        ? json({ error: "invalid_grant" }, 400)
        : json({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_in: 60
          })
  })
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    yield* TestClock.adjust("1 minute")
    expect((yield* Effect.flip(auth.accessToken(server.instanceId)))._tag).toBe(
      "SignedOut"
    )
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
  }).pipe(Effect.provide(fake.layer))
})

it.effect("forgets the tokens when the server answers 401", () => {
  const fake = fakeServer()
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    const api = yield* auth.api(server.instanceId)
    yield* Effect.flip(api.org.get({ params: { orgSlug: "igne" } }))
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
  }).pipe(Effect.provide(fake.layer))
})

const tokenPair = (access: string, refresh: string, expiresIn: number) =>
  json({ access_token: access, refresh_token: refresh, expires_in: expiresIn })

it.effect("keeps newer tokens when an older request comes back 401", () => {
  const fake = fakeServer({
    token: (body) =>
      body.get("grant_type") === "refresh_token"
        ? tokenPair("access-2", "refresh-2", 3600)
        : tokenPair("access-1", "refresh-1", 180)
  })
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    const stale = yield* auth.api(server.instanceId)
    yield* TestClock.adjust("3 minutes")
    expect(yield* auth.accessToken(server.instanceId)).toBe("access-2")
    yield* Effect.flip(stale.org.get({ params: { orgSlug: "igne" } }))
    expect(
      Option.map(
        yield* store.tokens(server.instanceId),
        (tokens) => tokens.accessToken
      )
    ).toEqual(Option.some("access-2"))
  }).pipe(Effect.provide(fake.layer))
})

it.effect("signing out during a refresh leaves no tokens behind", () => {
  const gate = Promise.withResolvers<Response>()
  const fake = fakeServer({
    token: (body) =>
      body.get("grant_type") === "refresh_token"
        ? gate.promise
        : tokenPair("access-1", "refresh-1", 60)
  })
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    yield* TestClock.adjust("1 minute")
    const refreshing = yield* Effect.forkChild(
      auth.accessToken(server.instanceId)
    )
    yield* Effect.yieldNow
    const signingOut = yield* Effect.forkChild(auth.signOut(server.instanceId))
    yield* Effect.yieldNow
    gate.resolve(tokenPair("access-2", "refresh-2", 3600))
    yield* Fiber.join(refreshing)
    yield* Fiber.join(signingOut)
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
  }).pipe(Effect.provide(fake.layer))
})

it.effect("gives up on a token response that never finishes", () => {
  const fake = fakeServer({
    token: (body) =>
      body.get("grant_type") === "refresh_token"
        ? new Response(new ReadableStream({ start: () => {} }), {
            headers: { "content-type": "application/json" }
          })
        : tokenPair("access-1", "refresh-1", 60)
  })
  return Effect.gen(function* () {
    yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    yield* TestClock.adjust("1 minute")
    const fiber = yield* Effect.forkChild(
      Effect.flip(auth.accessToken(server.instanceId))
    )
    yield* TestClock.adjust(authTimeout)
    yield* TestClock.adjust(authTimeout)
    expect((yield* Fiber.join(fiber))._tag).toBe("AuthUnavailable")
  }).pipe(Effect.provide(fake.layer))
})

it.effect("keeps no tokens when the account can't be loaded", () => {
  const fake = fakeServer({ me: () => json({}, 500) })
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    expect((yield* Effect.flip(auth.signIn(server.instanceId)))._tag).toBe(
      "AuthUnavailable"
    )
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
  }).pipe(Effect.provide(fake.layer))
})

it.effect("an interrupted sign-out still forgets the tokens", () => {
  const fake = fakeServer({ revoke: () => new Promise<Response>(() => {}) })
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    const signingOut = yield* Effect.forkChild(auth.signOut(server.instanceId))
    yield* Effect.yieldNow
    yield* Fiber.interrupt(signingOut)
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
  }).pipe(Effect.provide(fake.layer))
})

it.effect("removing a server signs out and forgets it", () => {
  const fake = fakeServer()
  return Effect.gen(function* () {
    const store = yield* withSavedServer
    const auth = yield* ServerAuth
    yield* auth.signIn(server.instanceId)
    yield* auth.remove(server.instanceId)
    expect(yield* store.tokens(server.instanceId)).toEqual(Option.none())
    expect(yield* store.list).toEqual([])
    expect(
      fake.calls.some((call) => call.url === "/api/auth/oauth2/revoke")
    ).toBe(true)
  }).pipe(Effect.provide(fake.layer))
})
