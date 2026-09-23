import { it } from "@effect/vitest"
import { EverhourError } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { afterEach, describe, expect, vi } from "vitest"

import { Everhour } from "./Everhour"
import { EverhourLive } from "./EverhourLive"

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

let fetchImplementation: FetchImplementation = () =>
  Promise.reject(new Error("fetch implementation not installed"))

const stubFetch = (implementation: FetchImplementation) => {
  fetchImplementation = implementation
}

const FetchLive = Layer.succeed(
  FetchHttpClient.Fetch,
  Object.assign(
    (input: string | URL | Request, init?: RequestInit) =>
      fetchImplementation(input, init),
    { preconnect: () => undefined }
  )
)

describe("EverhourLive response decoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.effect("maps a valid user response", () =>
    Effect.gen(function* () {
      stubFetch(
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
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )

  it.effect("rejects a malformed successful response", () =>
    Effect.gen(function* () {
      stubFetch(vi.fn(async () => jsonResponse({ id: null })))
      const everhour = yield* Everhour
      const error = yield* Effect.flip(everhour.getCurrentUser("api-key"))
      expect(Schema.is(EverhourError)(error)).toBe(true)
    }).pipe(Effect.provide(EverhourLive.pipe(Layer.provide(FetchLive))))
  )
})
