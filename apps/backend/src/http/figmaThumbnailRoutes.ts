import { FigmaLinks } from "@pp/server-core/figma/FigmaLinks"
import { parseFigmaThumbnailUrl } from "@pp/server-core/figma/FigmaLinks"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

import { requestUserId } from "./requestUserId"

const notFound = HttpServerResponse.text("Not Found", { status: 404 })

const serveFigmaThumbnail = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const ref = parseFigmaThumbnailUrl(url.pathname)
  if (!ref) return notFound

  const userId = yield* requestUserId
  if (Option.isNone(userId)) {
    return HttpServerResponse.text("Unauthorized", { status: 401 })
  }

  const figmaLinks = yield* FigmaLinks
  const signed = yield* figmaLinks.resolveThumbnailUrl(
    ref.orgSlug,
    userId.value,
    ref.linkId
  )
  return HttpServerResponse.redirect(signed, {
    status: 302,
    headers: { "cache-control": "private, no-store" }
  })
}).pipe(
  Effect.catchTags({
    NotFound: () => Effect.succeed(notFound),
    Forbidden: () => Effect.succeed(notFound),
    StorageNotConnected: () => Effect.succeed(notFound),
    StorageConfigMissing: () =>
      Effect.succeed(
        HttpServerResponse.text("Storage unavailable", { status: 503 })
      ),
    StorageError: () =>
      Effect.succeed(
        HttpServerResponse.text("Storage unavailable", { status: 502 })
      )
  }),
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("figma thumbnail route failure", cause),
      Effect.succeed(
        HttpServerResponse.text("Figma thumbnail failed", { status: 500 })
      )
    )
  )
)

export const figmaThumbnailRoutes = serveFigmaThumbnail
