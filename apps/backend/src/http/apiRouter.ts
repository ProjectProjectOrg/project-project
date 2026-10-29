import * as Effect from "effect/Effect"
import { HttpRouter } from "effect/http"
import * as Layer from "effect/Layer"

export const ApiRouterLive = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
)
