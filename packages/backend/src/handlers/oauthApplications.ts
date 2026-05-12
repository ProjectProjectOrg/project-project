import { HttpApiBuilder, HttpServerRequest } from "@effect/platform"
import { AppApi, CurrentUser, Validation } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { BetterAuth } from "../Services/BetterAuth"
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
      .handle("consent", ({ payload }) =>
        Effect.gen(function* () {
          yield* CurrentUser
          const ba = yield* BetterAuth
          const req = yield* HttpServerRequest.HttpServerRequest
          const result = yield* ba
            .submitConsent(req.headers as unknown as Headers, payload)
            .pipe(
              Effect.mapError(
                () => new Validation({ reason: "consent_rejected" })
              )
            )
          return { redirectURI: result.redirectURI }
        })
      )
)
