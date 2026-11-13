import * as Inbox from "@pp/server-core/inbox/Inbox"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const InboxHandlerLive = HttpApiBuilder.group(
  AppApi,
  "inbox",
  (handlers) =>
    handlers.handle("markRead", ({ params }) =>
      Effect.flatMap(Inbox.Inbox, (inbox) => inbox.markRead(params.id))
    )
)
