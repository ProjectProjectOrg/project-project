import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpRouter } from "effect/unstable/http"

export const ApiRouterLive = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
)
