import type { GitHubTokenExpired } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export class GitHubHost extends Context.Service<
  GitHubHost,
  Readonly<{
    userAccessToken: (
      userId: string
    ) => Effect.Effect<string, GitHubTokenExpired>
  }>
>()("@pp/integration-github/Host/GitHubHost") {}
