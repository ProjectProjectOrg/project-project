import { createResourceServerChallenge } from "@better-auth/oauth-provider"
import { describe, expect, it } from "@effect/vitest"
import { APIError } from "better-auth/api"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { resourceChallenge } from "./resourceChallenge"

const resource = "https://pp.example.com/api/v1/tools"
const metadata =
  'resource_metadata="https://pp.example.com/.well-known/oauth-protected-resource/api/v1/tools"'

describe("resourceChallenge", () => {
  it.effect(
    "answers a DPoP proof error whose text Better Auth can't quote",
    () =>
      Effect.gen(function* () {
        const cause = new APIError("UNAUTHORIZED", {
          error: "invalid_dpop_proof",
          error_description: 'DPoP proof typ must be "dpop+jwt"'
        })
        expect(() => createResourceServerChallenge(cause, resource)).toThrow()
        const challenge = yield* resourceChallenge(cause, resource)
        expect(Option.getOrThrow(challenge)).toMatchObject({
          status: 401,
          wwwAuthenticate: expect.stringMatching(
            /^DPoP error="invalid_dpop_proof", algs="[^"]+", Bearer /
          )
        })
      })
  )

  it.effect("keeps the DPoP scheme for a DPoP failure it can describe", () =>
    Effect.gen(function* () {
      const cause = new APIError("UNAUTHORIZED", {
        error: "invalid_dpop_proof",
        error_description: "DPoP proof is too old"
      })
      const challenge = yield* resourceChallenge(cause, resource)
      expect(Option.getOrThrow(challenge).wwwAuthenticate).toMatch(/^DPoP /)
    })
  )

  it.effect("points a bearer failure at the resource metadata", () =>
    Effect.gen(function* () {
      const cause = new APIError("UNAUTHORIZED", { message: "invalid token" })
      const challenge = yield* resourceChallenge(cause, resource)
      expect(Option.getOrThrow(challenge).wwwAuthenticate).toBe(
        `Bearer ${metadata}`
      )
    })
  )

  it.effect("leaves errors that aren't about the token alone", () =>
    Effect.gen(function* () {
      const challenge = yield* resourceChallenge(new Error("db down"), resource)
      expect(Option.isNone(challenge)).toBe(true)
    })
  )
})
