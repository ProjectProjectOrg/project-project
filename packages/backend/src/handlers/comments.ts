import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser, Validation } from "@projectproject/shared"
import { Effect } from "effect"
import { Comments } from "../Services/Comments"
import { CurrentOrg } from "../Services/CurrentOrg"

const dieOnMarkdown = <A, R>(eff: Effect.Effect<A, any, R>) =>
  eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))

export const CommentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "ticketComments",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const comments = yield* Comments
          return yield* comments.list(org.orgSlug, user.id, path.slug, path.id)
        }).pipe(dieOnMarkdown)
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const comments = yield* Comments
          return yield* comments.create(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const comments = yield* Comments
          return yield* comments.edit(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            path.commentId,
            payload
          )
        }).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const comments = yield* Comments
          yield* comments.remove(
            org.orgSlug,
            user.id,
            path.slug,
            path.id,
            path.commentId
          )
        }).pipe(dieOnMarkdown)
      )
)
