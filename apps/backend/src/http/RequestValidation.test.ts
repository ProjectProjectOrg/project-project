import { describe, expect, it } from "@effect/vitest"
import { InvalidRequest, RequestValidation } from "@pp/shared"
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

import { RequestValidationLive } from "./RequestValidation"

const ProbeApi = HttpApi.make("validation-probe")
  .add(
    HttpApiGroup.make("probe")
      .add(
        HttpApiEndpoint.post("echo", "/echo", {
          payload: Schema.Struct({ title: Schema.String }),
          success: Schema.String
        })
      )
      .add(
        HttpApiEndpoint.get("broken", "/broken", {
          success: Schema.NonEmptyString
        })
      )
  )
  .middleware(RequestValidation)

const ProbeLive = HttpApiBuilder.group(ProbeApi, "probe", (handlers) =>
  handlers
    .handle("echo", ({ payload }) => Effect.succeed(payload.title))
    .handle("broken", () => Effect.succeed(""))
)

const send = (request: Request) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        HttpApiBuilder.layer(ProbeApi).pipe(
          Layer.provide(ProbeLive),
          Layer.provide(RequestValidationLive),
          Layer.provideMerge(HttpServer.layerServices)
        ),
        { disableLogger: true }
      )
    ),
    ({ handler }) =>
      Effect.promise(async () => {
        const response = await handler(request)
        return { status: response.status, body: await response.text() }
      }),
    ({ dispose }) => Effect.promise(dispose)
  )

describe("RequestValidationLive", () => {
  it.effect("tells the caller which part of the request is invalid", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        new Request("http://localhost/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: `{"title":42}`
        })
      )
      expect(reply.status).toBe(400)
      const error = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(InvalidRequest)
      )(reply.body)
      expect(error).toMatchObject({
        part: "payload",
        message: expect.stringContaining("title")
      })
    })
  )

  it.effect("keeps a response that fails to encode a server error", () =>
    Effect.gen(function* () {
      const reply = yield* send(new Request("http://localhost/broken"))
      expect(reply.status).toBe(500)
    })
  )
})
