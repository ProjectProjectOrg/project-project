import { EverhourWebhooks } from "@pp/integration-everhour/Webhooks"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

const everhourWebhookRoute = Effect.gen(function* () {
  const webhooks = yield* EverhourWebhooks
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const match = url.pathname.match(/\/webhook\/([^/]+)\/?$/)
  const secret = match?.[1] ? decodeURIComponent(match[1]) : null
  if (!secret)
    return HttpServerResponse.text("Missing webhook secret", { status: 400 })
  const body = yield* Effect.promise(() => webReq.text().catch(() => ""))
  yield* webhooks.handle({ secret, body })
  return HttpServerResponse.text("ok")
}).pipe(
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("everhour webhook route failure", cause),
      Effect.succeed(HttpServerResponse.text("ok"))
    )
  )
)

export const everhourWebhookRoutes = HttpRouter.add(
  "POST",
  "/api/integrations/everhour/webhook/:secret",
  everhourWebhookRoute
)
