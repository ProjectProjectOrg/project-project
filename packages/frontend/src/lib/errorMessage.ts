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
  | InviteAcceptError

export const errorMessage = (error: AppError): string =>
  Match.value(error).pipe(
    Match.tag("InviteExpired", () => m.auth_invites_accept_error_expired()),
    Match.tag("InviteNotFound", () => m.auth_invites_accept_error_not_found()),
    Match.tag("InviteNotRecipient", () =>
      m.auth_invites_accept_error_not_recipient()
    ),
    Match.tag("InviteEmailVerificationRequired", () =>
      m.auth_invites_accept_error_email_verification_required()
    ),
    Match.tag("InviteAcceptFailed", () => m.auth_invites_accept_row_error()),
    Match.tag("SprintCompletedImmutable", () =>
      m.error_sprint_completed_immutable()
    ),
    Match.tag("Conflict", (error) =>
      error.reason === "project_key_taken"
        ? m.projects_create_key_taken_error()
        : m.error_unknown()
    ),
    Match.tag("MentionInvalid", () => m.error_mention_invalid()),
    Match.tag("Unauthorized", () => m.error_unknown()),
    Match.orElse(() => m.error_unknown())
  )
