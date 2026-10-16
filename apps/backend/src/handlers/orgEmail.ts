import { OrgEmail } from "@pp/server-core/email/OrgEmail"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const OrgEmailHandlerLive = HttpApiBuilder.group(
  AppApi,
  "orgEmail",
  (handlers) =>
    handlers
      .handle("get", () => Effect.flatMap(OrgEmail, (email) => email.get()))
      .handle("save", ({ payload }) =>
        Effect.flatMap(OrgEmail, (email) => email.save(payload))
      )
      .handle("test", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* (yield* OrgEmail).test(user.email)
        })
      )
      .handle("disconnect", () =>
        Effect.flatMap(OrgEmail, (email) => email.disconnect())
      )
)
