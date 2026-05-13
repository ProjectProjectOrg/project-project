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
  MentionInvalid,
  NotFound,
  RateLimited,
  RepoGone,
  SprintCompletedImmutable,
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
  | MentionInvalid
  | SprintCompletedImmutable

export const errorMessage = (error: AppError): string =>
  Match.value(error).pipe(
    Match.tag("SprintCompletedImmutable", () =>
      m.error_sprint_completed_immutable()
    ),
    Match.tag("MentionInvalid", () => m.error_mention_invalid()),
    Match.tag("Unauthorized", () => m.error_unknown()),
    Match.orElse(() => m.error_unknown())
  )
