import { Comments } from "@pp/server-core/comments/Comments"
import { AppApi, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const CommentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "ticketComments",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        Effect.flatMap(Comments, (comments) => comments.list(params.id)).pipe(
          dieOnMarkdown
        )
      )
      .handle("create", ({ params, payload }) =>
        Effect.flatMap(Comments, (comments) =>
          comments.create(params.id, payload)
        ).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(Comments, (comments) =>
          comments.edit(params.id, params.commentId, payload)
        ).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("delete", ({ params }) =>
        Effect.flatMap(Comments, (comments) =>
          comments.remove(params.id, params.commentId)
        ).pipe(dieOnMarkdown)
      )
)
