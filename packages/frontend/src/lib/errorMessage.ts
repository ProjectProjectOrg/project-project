import * as Match from "effect/Match"
import type {
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  RateLimited,
  RepoGone,
  Unauthorized
} from "@projectproject/shared"
import { m } from "@/paraglide/messages"

export type AppError =
  | Unauthorized
  | NotFound
  | Forbidden
  | Conflict
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | BranchExists
  | BranchProtected
  | RateLimited
  | GitHubError
  | BranchNotFound

export const errorMessage = (error: AppError): string =>
  Match.value(error).pipe(
    Match.tag("Unauthorized", () => m.error_unknown()),
    Match.orElse(() => m.error_unknown())
  )
