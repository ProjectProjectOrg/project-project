import type { Session, User } from "../auth"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

export class BetterAuthError extends Data.TaggedError("BetterAuthError")<{
  readonly cause: unknown
}> {}

// Boundary error: user has no GitHub account row, or the row has no token.
// The Auth service maps this to `GitHubTokenExpired` for the wire.
export class NoGithubToken extends Data.TaggedError("NoGithubToken")<{}> {}

export interface BetterAuthShape {
  readonly handler: (
    request: Request
  ) => Effect.Effect<Response, BetterAuthError>
  readonly getSession: (
    headers: Headers
  ) => Effect.Effect<{ user: User; session: Session } | null, BetterAuthError>
  readonly getGithubAccessToken: (
    userId: string
  ) => Effect.Effect<string, NoGithubToken | BetterAuthError>
  readonly getOrgSlugById: (
    organizationId: string | null | undefined
  ) => Effect.Effect<string | null, BetterAuthError>
}

export class BetterAuth extends Context.Tag("@projectproject/backend/Services/BetterAuth")<
  BetterAuth,
  BetterAuthShape
>() {}
