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
  Unauthorized,
  Validation
} from "@projectproject/shared"
import type { InviteAcceptError } from "@/lib/invitations"
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
  | Validation
  | InviteAcceptError

export const errorMessage = (error: AppError): string =>
  Match.value(error).pipe(
    Match.tags({
      InviteExpired: () => m.auth_invites_accept_error_expired(),
      InviteNotFound: () => m.auth_invites_accept_error_not_found(),
      InviteNotRecipient: () => m.auth_invites_accept_error_not_recipient(),
      InviteEmailVerificationRequired: () =>
        m.auth_invites_accept_error_email_verification_required(),
      InviteAcceptFailed: () => m.auth_invites_accept_row_error(),
      SprintCompletedImmutable: () => m.error_sprint_completed_immutable(),
      Conflict: (error) =>
        error.reason === "project_key_taken"
          ? m.projects_create_key_taken_error()
          : m.error_unknown(),
      MentionInvalid: () => m.error_mention_invalid(),
      NotFound: () => m.error_not_found(),
      Forbidden: () => m.error_forbidden(),
      Validation: () => m.error_unknown(),
      GitHubTokenExpired: () => m.git_github_token_expired_error(),
      GitHubScopeInsufficient: () => m.git_github_scope_insufficient_error(),
      RepoGone: () => m.git_repo_gone_error(),
      RateLimited: () => m.error_rate_limited(),
      GitHubError: () => m.error_github(),
      BranchExists: (error) =>
        m.git_branch_exists_error({ name: error.branch }),
      BranchProtected: () => m.git_branch_protected_error(),
      BranchNotFound: (error) =>
        m.git_branch_not_found_error({ name: error.name }),
      Unauthorized: () => m.error_unknown()
    }),
    Match.orElse(() => m.error_unknown())
  )

const tagOf = (value: unknown): string => {
  if (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    typeof (value as { _tag: unknown })._tag === "string"
  ) {
    return (value as { _tag: string })._tag
  }
  return "Unknown"
}

export const ticketListErrorMessage = (error: unknown): string => {
  const tag = tagOf(error)
  if (tag === "MalformedQuery") return m.tickets_list_malformed_query()
  return m.tickets_list_load_error({ error: tag })
}

export const ticketListDefectMessage = (defect: unknown): string =>
  m.tickets_list_defect({ defect: String(defect) })
