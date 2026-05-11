import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { OAuthApplications } from "../Services/OAuthApplications"

export const OAuthApplicationsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "oauthApplications",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const svc = yield* OAuthApplications
          return yield* svc.listForUser(user.id)
        })
      )
      .handle("revoke", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const svc = yield* OAuthApplications
          yield* svc.revokeForUser(user.id, path.id)
          return { ok: true } as const
        })
      )
)
