import { TicketActivityFeed } from "@pp/server-core/activity/TicketActivityFeed"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "./lib"

export const TicketActivityHandlerLive = HttpApiBuilder.group(
  AppApi,
  "ticketActivity",
  (handlers) =>
    handlers.handle("list", ({ params, query }) =>
      Effect.flatMap(TicketActivityFeed, (feed) =>
        feed.list(params.id, query.cursor)
      ).pipe(dieOnMarkdown)
    )
)
