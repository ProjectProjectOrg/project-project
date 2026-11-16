import * as Inbox from "@pp/server-core/inbox/Inbox"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const InboxHandlerLive = HttpApiBuilder.group(
  AppApi,
  "inbox",
  (handlers) =>
    Effect.gen(function* () {
      const inbox = yield* Inbox.Inbox
      return handlers
        .handle("list", ({ query }) => inbox.list(query))
        .handle("unread", () =>
          Effect.map(inbox.unread(), (count) => ({ count }))
        )
        .handle("readAll", () => inbox.readAll())
        .handle("doneAll", () => inbox.doneAll())
        .handle("markRead", ({ params }) => inbox.markRead(params.id))
        .handle("markUnread", ({ params }) => inbox.markUnread(params.id))
        .handle("markDone", ({ params }) => inbox.markDone(params.id))
    })
)
