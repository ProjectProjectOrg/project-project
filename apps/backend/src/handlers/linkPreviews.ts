import * as LinkPreviews from "@pp/server-core/linkPreviews/LinkPreviews"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const LinkPreviewsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "linkPreviews",
  (handlers) =>
    handlers.handle("get", ({ query }) =>
      Effect.flatMap(LinkPreviews.LinkPreviews, (linkPreviews) =>
        linkPreviews.get(query.url)
      )
    )
)
