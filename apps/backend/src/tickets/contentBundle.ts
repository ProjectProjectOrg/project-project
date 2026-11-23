import * as TicketActivityFeed from "@pp/server-core/activity/TicketActivityFeed"
import * as Comments from "@pp/server-core/comments/Comments"
import * as TicketSubscriptions from "@pp/server-core/subscriptions/TicketSubscriptions"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import {
  CHILD_TICKET_SORT,
  ProjectScope,
  TicketContent,
  TicketContentLine,
  type TicketContentKind,
  type TicketContentRequest,
  type TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

export const contentBundle = Effect.fnUntraced(function* ({
  ids,
  kinds
}: TicketContentRequest) {
  const scope = yield* ProjectScope
  const tickets = yield* TicketQueries.TicketQueries
  const comments = yield* Comments.Comments
  const activity = yield* TicketActivityFeed.TicketActivityFeed
  const subscriptions = yield* TicketSubscriptions.TicketSubscriptions
  const uniqueKinds = [...new Set(kinds)]
  const uniqueIds = [...new Set(ids)]
  const details = uniqueKinds.includes("Detail")
    ? yield* tickets.prepareDetails(uniqueIds)
    : tickets.get
  const read = Effect.fnUntraced(function* (
    kind: TicketContentKind,
    id: TicketId
  ) {
    switch (kind) {
      case "Detail":
        return TicketContent.cases.Detail.make({ value: yield* details(id) })
      case "Comments":
        return TicketContent.cases.Comments.make({
          value: yield* comments.list(id)
        })
      case "Activity":
        return TicketContent.cases.Activity.make({
          value: yield* activity
            .list(id, undefined)
            .pipe(Effect.catchTag("Validation", Effect.die))
        })
      case "Subscribers":
        return TicketContent.cases.Subscribers.make({
          value: yield* subscriptions.list(id)
        })
      case "Children":
        return TicketContent.cases.Children.make({
          value: yield* tickets.list({ parent: [id], sort: CHILD_TICKET_SORT })
        })
    }
    return kind satisfies never
  })
  return yield* Effect.forEach(
    uniqueIds.flatMap((id) => uniqueKinds.map((kind) => ({ id, kind }))),
    ({ id, kind }) =>
      read(kind, id).pipe(
        Effect.map((content) =>
          TicketContentLine.cases.Found.make({ id, content })
        ),
        Effect.catchTag("NotFound", () =>
          Effect.succeed(TicketContentLine.cases.Missing.make({ id, kind }))
        ),
        dieOnMarkdown,
        Effect.provideService(ProjectScope, scope)
      ),
    { concurrency: 8 }
  )
})
