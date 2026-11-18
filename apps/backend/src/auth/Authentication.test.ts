import { describe, expect, it } from "@effect/vitest"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import { Authentication } from "@pp/shared"
import { APIError } from "better-auth/api"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup
} from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { AuthenticationLive } from "./Authentication"

const ProbeApi = HttpApi.make("auth-probe").add(
  HttpApiGroup.make("probe")
    .add(HttpApiEndpoint.get("me", "/me", { success: Schema.String }))
    .middleware(Authentication)
)

const ProbeLive = HttpApiBuilder.group(ProbeApi, "probe", (handlers) =>
  handlers.handle("me", () => Effect.succeed("ok"))
)

const statusWhenSessionFailsWith = (cause: unknown) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        HttpApiBuilder.layer(ProbeApi).pipe(
          Layer.provide(ProbeLive),
          Layer.provide(AuthenticationLive),
          Layer.provide(
            Layer.mock(BetterAuth.BetterAuth, {
              getSession: () =>
                Effect.fail(new BetterAuth.BetterAuthError({ cause }))
            })
          ),
          Layer.provideMerge(HttpServer.layerServices)
        ),
        { disableLogger: true }
      )
    ),
    ({ handler }) =>
      Effect.promise(async () => {
        const response = await handler(
          new Request("http://localhost/me", {
            headers: { cookie: "better-auth.session_token=t" }
          })
        )
        return response.status
      }),
    ({ dispose }) => Effect.promise(dispose)
  )

describe("AuthenticationLive", () => {
  it.effect("treats a Better Auth refusal as signed out", () =>
    Effect.gen(function* () {
      const status = yield* statusWhenSessionFailsWith(
        new APIError("UNAUTHORIZED")
      )
      expect(status).toBe(401)
    })
  )

  it.effect("reports a failure to read the session as a server error", () =>
    Effect.gen(function* () {
      const status = yield* statusWhenSessionFailsWith(
        new Error("connection refused")
      )
      expect(status).toBe(500)
    })
  )
})
