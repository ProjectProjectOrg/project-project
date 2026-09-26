import { it } from "@effect/vitest"
import { Instance, type InstanceShape } from "@pp/server-core/instance/Instance"
import {
  AppApi,
  appProtocolVersion,
  type InstanceDescriptor,
  InstanceNotConfigured
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiClient } from "effect/unstable/httpapi"
import { expect } from "vitest"

import { ApiRouterLive } from "../http/apiRouter"
import { InstanceHandlerLive } from "./instance"

const descriptor: InstanceDescriptor = {
  instanceId: "3f9c2a7e8b1d4c6f",
  name: "Igne",
  logo: null,
  serverVersion: "sha-457effd",
  protocolVersion: appProtocolVersion
}

const clientFor = Effect.fnUntraced(function* (instance: InstanceShape) {
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        HttpApiBuilder.layer(
          HttpApi.make(AppApi.identifier).add(AppApi.groups.instance)
        ).pipe(
          Layer.provide(InstanceHandlerLive),
          HttpRouter.provideRequest(Layer.succeed(Instance, instance)),
          Layer.provide(ApiRouterLive),
          Layer.provideMerge(HttpServer.layerServices)
        )
      )
    ),
    (web) => Effect.promise(() => web.dispose())
  )
  const fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) =>
      web.handler(
        input instanceof Request ? input : new Request(String(input), init)
      ),
    { preconnect: globalThis.fetch.preconnect }
  )
  return yield* HttpApiClient.make(AppApi, {
    baseUrl: "http://localhost/api"
  }).pipe(
    Effect.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
      )
    )
  )
})

it.effect(
  "GET /api/instance returns the descriptor without authentication",
  () =>
    Effect.gen(function* () {
      const client = yield* clientFor({ describe: Effect.succeed(descriptor) })
      expect(yield* client.instance.get()).toEqual(descriptor)
    })
)

it.effect(
  "GET /api/instance surfaces InstanceNotConfigured as a typed 503",
  () =>
    Effect.gen(function* () {
      const client = yield* clientFor({
        describe: Effect.fail(new InstanceNotConfigured())
      })
      const error = yield* Effect.flip(client.instance.get())
      expect(error).toBeInstanceOf(InstanceNotConfigured)
      const response = yield* client.instance.get({
        responseMode: "response-only"
      })
      expect(response.status).toBe(503)
    })
)
