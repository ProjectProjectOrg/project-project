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

const conflictReason = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    (error as { _tag: unknown })._tag === "Conflict" &&
    "reason" in error &&
    typeof (error as { reason: unknown }).reason === "string"
  ) {
    return (error as { reason: string }).reason
  }
  return null
}

export const statusCreateErrorMessage = (error: unknown): string => {
  switch (conflictReason(error)) {
    case "reserved_slug":
      return m.tickets_status_validation_reserved()
    case "slug_exists":
      return m.tickets_status_validation_slug_exists()
    case "invalid_label":
      return m.tickets_status_validation_invalid_label()
    default:
      return m.tickets_status_create_error_fallback()
  }
}

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
