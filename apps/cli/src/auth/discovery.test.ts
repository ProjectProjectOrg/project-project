import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import { fakeHttp } from "../testing"
import { discover } from "./discovery"

const origin = "https://pp.example.com"

const projectProject = fakeHttp((url) => {
  if (url.pathname === "/.well-known/oauth-protected-resource/api/v1/tools") {
    return Response.json({
      resource: `${origin}/api/v1/tools`,
      authorization_servers: [`${origin}/api/auth`]
    })
  }
  if (url.pathname === "/.well-known/oauth-authorization-server/api/auth") {
    return Response.json({
      issuer: `${origin}/api/auth`,
      authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
      token_endpoint: `${origin}/api/auth/oauth2/token`,
      revocation_endpoint: `${origin}/api/auth/oauth2/revoke`
    })
  }
  return new Response("not found", { status: 404 })
})

describe("discover", () => {
  it.effect("follows the tools resource to its sign-in endpoints", () =>
    Effect.gen(function* () {
      expect(yield* discover(origin)).toEqual({
        origin,
        resource: `${origin}/api/v1/tools`,
        authorizationEndpoint: `${origin}/api/auth/oauth2/authorize`,
        tokenEndpoint: `${origin}/api/auth/oauth2/token`,
        revocationEndpoint: `${origin}/api/auth/oauth2/revoke`,
        catalogVersion: undefined
      })
    }).pipe(Effect.provide(projectProject))
  )

  it.effect("tells you when an address isn't a ProjectProject server", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(discover("https://example.com"))
      expect(failure.code).toBe(8)
      expect(failure.message).toContain(
        "doesn't look like a ProjectProject server"
      )
    }).pipe(
      Effect.provide(fakeHttp(() => new Response("nope", { status: 404 })))
    )
  )

  it.effect("rejects metadata for a different resource", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(discover(origin))
      expect(failure.code).toBe(8)
    }).pipe(
      Effect.provide(
        fakeHttp(() =>
          Response.json({
            resource: "https://elsewhere.example.com/api/v1/tools",
            authorization_servers: ["https://elsewhere.example.com/api/auth"]
          })
        )
      )
    )
  )
})
