import { Match } from "effect"
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
  Unauthorized,
  Validation
} from "@projectproject/shared"
import { m } from "@/paraglide/messages"

export type AppError =
  | Unauthorized
  | NotFound
  | Forbidden
  | Conflict
  | Validation
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | BranchExists
  | BranchProtected
  | BranchNotFound
  | RateLimited
  | GitHubError

export const errorMessage = (error: AppError): string =>
  Match.value(error).pipe(
    Match.tag("Unauthorized", () => m.error_unauthorized()),
    Match.tag("NotFound", () => m.error_not_found()),
    Match.tag("Forbidden", () => m.error_forbidden()),
    Match.tag("Conflict", (e) => m.error_conflict({ reason: e.reason })),
    Match.tag("Validation", (e) => m.error_validation({ reason: e.reason })),
    Match.tag("GitHubTokenExpired", () => m.git_github_token_expired_error()),
    Match.tag("GitHubScopeInsufficient", () =>
      m.git_github_scope_insufficient_error()
    ),
    Match.tag("RepoGone", () => m.git_repo_gone_error()),
    Match.tag("BranchExists", (e) => m.git_branch_exists_error({ name: e.branch })),
    Match.tag("BranchProtected", () => m.git_branch_protected_error()),
    Match.tag("BranchNotFound", (e) => m.git_branch_not_found_error({ name: e.name })),
    Match.tag("RateLimited", () => m.error_rate_limited()),
    Match.tag("GitHubError", (e) => m.git_error_generic({ message: e.message })),
    Match.exhaustive
  )
