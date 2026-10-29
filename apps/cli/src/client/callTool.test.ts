import { describe, expect, it } from "@effect/vitest"
import { catalogVersion } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"

import { notSignedIn } from "../CliFailure"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import { fakeHttp, formBody } from "../testing"
import { callTool } from "./callTool"

const server: SavedServer = {
  origin: "https://pp.example.com",
  user: { id: "u-1", name: "Ada", email: "ada@example.com" },
  endpoints: { token: "https://pp.example.com/api/auth/oauth2/token" },
  tokens: {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: 3_600_000
  }
}

const saved: Array<SavedServer> = []

const store = Layer.succeed(
  ServerStore,
  ServerStore.of({
    file: "servers.json",
    list: Effect.die("unused"),
    save: (updated) => Effect.sync(() => void saved.push(updated)),
    remove: () => Effect.die("unused"),
    setDefault: () => Effect.die("unused"),
    setScope: () => Effect.die("unused"),
    update: (_origin, change) =>
      Effect.tap(change(saved.at(-1) ?? server), (updated) =>
        Effect.sync(() => void saved.push(updated))
      ),
    select: () =>
      saved.length === 0
        ? Effect.fail(notSignedIn("unused"))
        : Effect.succeed(saved[saved.length - 1]!)
  })
)

const answering = (status: number, body: unknown) =>
  Layer.merge(
    store,
    fakeHttp(() => Response.json(body, { status }))
  )

describe("callTool", () => {
  it.effect("returns the tool's output", () =>
    Effect.gen(function* () {
      expect(yield* callTool(server, "me", {})).toEqual({ ok: true })
    }).pipe(Effect.provide(answering(200, { ok: true })))
  )

  it.effect("turns a ToolFailure into the matching exit code and message", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        callTool(server, "get_ticket", { id: "T-1" })
      )
      expect(failure.code).toBe(5)
      expect(failure.message).toBe("Not found.")
    }).pipe(
      Effect.provide(
        answering(422, {
          _tag: "ToolFailure",
          error: "NotFound",
          message: "Not found."
        })
      )
    )
  )

  it.effect("tells you which server to sign in to again on a 401", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(callTool(server, "me", {}))
      expect(failure.code).toBe(3)
      expect(failure.message).toContain("`pp login https://pp.example.com`")
    }).pipe(
      Effect.provide(
        answering(401, {
          _tag: "ToolFailure",
          error: "Unauthorized",
          message: "Run `pp login` and try again."
        })
      )
    )
  )

  it.effect("tells the server which tool catalog it was built with", () =>
    Effect.gen(function* () {
      const headers: Array<string | undefined> = []
      yield* callTool(server, "me", {}).pipe(
        Effect.provide(
          Layer.merge(
            store,
            fakeHttp((_, request) => {
              headers.push(request.headers["pp-catalog-version"])
              return Response.json({ ok: true })
            })
          )
        )
      )
      expect(headers).toEqual([catalogVersion])
    })
  )

  it.effect("asks you to upgrade when the server's catalog differs", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(callTool(server, "me", {}))
      expect(failure.code).toBe(10)
      expect(failure.message).toContain("`pp upgrade`")
    }).pipe(
      Effect.provide(
        answering(409, {
          _tag: "ToolFailure",
          error: "CatalogMismatch",
          message: "Run `pp upgrade` to get the matching version."
        })
      )
    )
  )

  it.effect("refreshes a token about to expire and saves it", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(3_590_000)
      const seen: Array<string> = []
      const result = yield* callTool(server, "me", {}).pipe(
        Effect.provide(
          Layer.merge(
            store,
            fakeHttp((url, request) => {
              if (url.pathname === "/api/auth/oauth2/token") {
                const form = formBody(request)
                seen.push(`${form.get("grant_type")} ${form.get("resource")}`)
                return Response.json({
                  access_token: "access-2",
                  refresh_token: "refresh-2",
                  expires_in: 3600
                })
              }
              seen.push(request.headers["authorization"] ?? "")
              return Response.json({ ok: true })
            })
          )
        )
      )
      expect(result).toEqual({ ok: true })
      expect(seen).toEqual([
        "refresh_token https://pp.example.com/api/v1/tools",
        "Bearer access-2"
      ])
      expect(saved.at(-1)?.tokens).toEqual({
        accessToken: "access-2",
        refreshToken: "refresh-2",
        expiresAt: 3_590_000 + 3_600_000
      })
    })
  )

  it.effect(
    "uses the sign-in a previous call refreshed instead of refreshing again",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(3_590_000)
        const seen: Array<string> = []
        const layer = Layer.merge(
          store,
          fakeHttp((url, request) => {
            if (url.pathname === "/api/auth/oauth2/token") {
              seen.push(
                `refresh with ${formBody(request).get("refresh_token")}`
              )
              return Response.json({
                access_token: "access-3",
                refresh_token: "refresh-3",
                expires_in: 3600
              })
            }
            seen.push(request.headers["authorization"] ?? "")
            return Response.json({ ok: true })
          })
        )
        saved.length = 0
        yield* callTool(server, "me", {}).pipe(Effect.provide(layer))
        yield* callTool(server, "me", {}).pipe(Effect.provide(layer))
        expect(seen).toEqual([
          "refresh with refresh-1",
          "Bearer access-3",
          "Bearer access-3"
        ])
      })
  )
})
