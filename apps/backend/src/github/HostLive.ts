import { GitHubHost } from "@pp/integration-github/Host"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { GitHubTokenExpired } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const GitHubHostLive = Layer.effect(
  GitHubHost,
  Effect.gen(function* () {
    const auth = yield* BetterAuth
    return GitHubHost.of({
      userAccessToken: (userId) =>
        auth.getGithubAccessToken(userId).pipe(
          Effect.catchTag("NoGithubToken", () =>
            Effect.fail(new GitHubTokenExpired())
          ),
          Effect.catchTag("BetterAuthError", Effect.die)
        )
    })
  })
)
