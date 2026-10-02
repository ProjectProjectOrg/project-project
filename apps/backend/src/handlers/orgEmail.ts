import { OrgEmail } from "@pp/server-core/email/OrgEmail"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const OrgEmailHandlerLive = HttpApiBuilder.group(
  AppApi,
  "orgEmail",
  (handlers) =>
    handlers
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* OrgEmail).get(params.orgSlug, user.id)
        })
      )
      .handle("save", ({ params, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* OrgEmail).save(params.orgSlug, user.id, payload)
        })
      )
      .handle("test", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* OrgEmail).test(
            params.orgSlug,
            user.id,
            user.email
          )
        })
      )
      .handle("disconnect", ({ params }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* OrgEmail).disconnect(params.orgSlug, user.id)
        })
      )
)
