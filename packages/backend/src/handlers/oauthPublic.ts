import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AppApi, NotFound } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { BetterAuth } from "../Services/BetterAuth"

export const OAuthPublicHandlerLive = HttpApiBuilder.group(
  AppApi,
  "oauthPublic",
  (handlers) =>
    handlers.handle("publicClient", ({ query }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const name = yield* ba.getPublicClientName(query.client_id).pipe(
          Effect.catchTag("BetterAuthError", () => Effect.succeed(null))
        )
        if (name === null) return yield* new NotFound()
        return { name }
      })
    )
)
