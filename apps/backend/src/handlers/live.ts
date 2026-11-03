import * as LiveFeed from "@pp/server-core/live/LiveFeed"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const LiveHandlerLive = HttpApiBuilder.group(
  AppApi,
  "live",
  (handlers) =>
    Effect.gen(function* () {
      const feed = yield* LiveFeed.LiveFeed
      return handlers.handle("events", ({ query }) =>
        feed.forCurrentUser(query.after)
      )
    })
)
