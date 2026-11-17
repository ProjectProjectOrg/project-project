import * as Comments from "@pp/server-core/comments/Comments"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import type { CreateTicketInput } from "@pp/shared"
import * as Effect from "effect/Effect"

export const createTicket = ({ fromComment, ...input }: CreateTicketInput) =>
  Effect.gen(function* () {
    const created = yield* Effect.flatMap(
      TicketCommands.TicketCommands,
      (commands) => commands.create(input)
    )
    if (fromComment !== undefined) {
      yield* Effect.flatMap(Comments.Comments, (comments) =>
        comments.recordTicket(
          fromComment.ticketId,
          fromComment.commentId,
          created.id
        )
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning(
            "The new ticket wasn't listed under its comment",
            cause
          )
        )
      )
    }
    return created
  })
