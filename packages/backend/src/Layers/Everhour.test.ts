import { it } from "@effect/vitest"
import { EverhourError } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, vi } from "vite-plus/test"
import { Everhour } from "../Services/Everhour"
import { EverhourLive } from "./Everhour"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

describe("EverhourLive response decoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.effect("maps a valid user response", () =>
    Effect.gen(function* () {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({ id: 42, name: "Luuk", email: "luuk@example.com" })
        )
      )
      const everhour = yield* Everhour
      const user = yield* everhour.getCurrentUser("api-key")
      expect(user).toEqual({
        id: "42",
        name: "Luuk",
        email: "luuk@example.com"
      })
    }).pipe(Effect.provide(EverhourLive))
  )

  it.effect("rejects a malformed successful response", () =>
    Effect.gen(function* () {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ id: null }))
      )
      const everhour = yield* Everhour
      const error = yield* Effect.flip(everhour.getCurrentUser("api-key"))
      expect(Schema.is(EverhourError)(error)).toBe(true)
    }).pipe(Effect.provide(EverhourLive))
  )
})
