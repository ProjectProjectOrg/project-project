// Thin handlers for the `reviews` HttpApi group. All logic in Reviews.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { Reviews } from "../services/Reviews"

const dieOnMarkdown = <A, R>(eff: Effect.Effect<A, any, R>) =>
  eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))

export const ReviewsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "reviews",
  (handlers) =>
    handlers
      .handle("getForTicket", ({ path }) =>
        Effect
          .gen(function*() {
            const user = yield* CurrentUser
            const reviews = yield* Reviews
            return yield* reviews.getForTicket(user.id, path.slug, path.id)
          })
          .pipe(dieOnMarkdown))
)
