import * as Inbox from "@pp/server-core/inbox/Inbox"
import { AppApi, InboxEntryId } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"
import * as Schema from "effect/Schema"

const entryId = Schema.decodeSync(InboxEntryId)

const status = (entry: Inbox.EntryState) => ({
  ...entry,
  id: entryId(entry.id)
})

export const InboxHandlerLive = HttpApiBuilder.group(
  AppApi,
  "inbox",
  (handlers) =>
    handlers
      .handle("list", ({ query }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.list({
            ...(query.since === undefined ? {} : { since: query.since }),
            ...(query.state === undefined ? {} : { state: query.state }),
            ...(query.limit === undefined ? {} : { limit: query.limit }),
            ...(query.before === undefined || query.beforeId === undefined
              ? {}
              : { before: { at: query.before, id: query.beforeId } })
          })
        )
      )
      .handle("count", () =>
        Effect.flatMap(Inbox.Inbox, (inbox) => inbox.count()).pipe(
          Effect.map((unread) => ({ unread }))
        )
      )
      .handle("markRead", ({ params, payload }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.markRead(params.id, payload.revision)
        ).pipe(Effect.map(status))
      )
      .handle("markUnread", ({ params }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.markUnread(params.id)
        ).pipe(Effect.map(status))
      )
      .handle("remove", ({ params, query }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.remove(params.id, query.revision)
        ).pipe(Effect.map(status))
      )
      .handle("markAllRead", ({ payload }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) =>
          inbox.markAllRead(payload.upTo)
        ).pipe(Effect.map((cleared) => ({ cleared })))
      )
      .handle("markTicketRead", ({ params }) =>
        Effect.flatMap(Inbox.Inbox, (inbox) => inbox.markTicketRead(params.id))
      )
)
