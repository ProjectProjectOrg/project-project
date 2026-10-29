import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import { challengeFor, newPkce } from "./pkce"

describe("PKCE", () => {
  it.effect("derives the RFC 7636 example challenge", () =>
    Effect.gen(function* () {
      expect(
        yield* challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
      ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.effect("makes a fresh verifier and state each time", () =>
    Effect.gen(function* () {
      const first = yield* newPkce
      const second = yield* newPkce
      expect(first.verifier).toHaveLength(43)
      expect(first.verifier).not.toBe(second.verifier)
      expect(first.state).not.toBe(second.state)
      expect(first.challenge).toBe(yield* challengeFor(first.verifier))
    }).pipe(Effect.provide(BunServices.layer))
  )
})
