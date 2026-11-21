import * as Schema from "effect/Schema"

import { JiraFailureReason, JiraReconnectReason } from "./jira/JiraMigration"
import { BlockIssueCode } from "./tickets/blocks"
import { TicketBodyEditFailure } from "./tickets/bodyEdits"

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 }
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {},
  { httpApiStatus: 404 }
) {}

// 403 — caller is authenticated and the resource exists, but their role
// doesn't permit the action. Distinct from `NotFound` (which we *also* use
// when a non-member hits a project — see Tickets service comment) so that
// existing-but-disallowed actions get a clear signal.
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {},
  { httpApiStatus: 403 }
) {}

export const ValidationReason = Schema.Literals([
  "position_is_self",
  "split_needs_two_results",
  "edits_with_body",
  "invalid_cursor",
  "remove_self",
  "role_not_found",
  "invalid_email"
])
export type ValidationReason = typeof ValidationReason.Type

export class Validation extends Schema.TaggedError<Validation>()(
  "Validation",
  { reason: ValidationReason },
  { httpApiStatus: 400 }
) {}

export const InvalidRequestPart = Schema.Literals([
  "params",
  "query",
  "payload",
  "headers"
])
export type InvalidRequestPart = typeof InvalidRequestPart.Type

export class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  { part: InvalidRequestPart, message: Schema.String },
  { httpApiStatus: 400 }
) {}

// 400 — a `[label](mention:...)` link in a body field failed mention
// validation. Distinct from `Validation` so MCP agents (and the frontend)
// can switch on `kind` and report exactly what's wrong with which href.
// `kind` is one of:
//   - `malformed_href` — the URL doesn't match `mention:user/<id>` or
//     `mention:ticket/<T-N>` (typo, unknown type, missing slash).
//   - `empty_label`    — the link label between `[` and `]` is empty;
//     mentions must always have a visible label.
//   - `unknown_user`   — the user id isn't a member of this project.
//   - `unknown_ticket` — the ticket id doesn't exist in this project.
export const MentionInvalidKind = Schema.Literals([
  "malformed_href",
  "empty_label",
  "unknown_user",
  "unknown_ticket"
])
export type MentionInvalidKind = typeof MentionInvalidKind.Type

export class MentionInvalid extends Schema.TaggedError<MentionInvalid>()(
  "MentionInvalid",
  {
    kind: MentionInvalidKind,
    href: Schema.String
  },
  { httpApiStatus: 400 }
) {}

// 409 — the invitation exists but cannot be accepted. `reason` is a closed set
// so the frontend can render one string per case without matching on prose:
//   - `expired`                      — past `expiresAt`.
//   - `not_recipient`                — addressed to a different email.
//   - `email_verification_required`  — caller hasn't verified their email yet.
//   - `membership_limit_reached`     — the organisation is already at capacity.
// A missing or unknown invitation stays `NotFound`.
export const InvitationNotAcceptableReason = Schema.Literals([
  "expired",
  "not_recipient",
  "email_verification_required",
  "membership_limit_reached"
])
export type InvitationNotAcceptableReason =
  typeof InvitationNotAcceptableReason.Type

export class InvitationNotAcceptable extends Schema.TaggedError<InvitationNotAcceptable>()(
  "InvitationNotAcceptable",
  { reason: InvitationNotAcceptableReason },
  { httpApiStatus: 409 }
) {}

export class LastProjectPmBlocked extends Schema.TaggedError<LastProjectPmBlocked>()(
  "LastProjectPmBlocked",
  { projectSlugs: Schema.Array(Schema.String) },
  { httpApiStatus: 409 }
) {}

// --- GitHub-side errors -----------------------------------------------------
// Distinct from generic 4xx because the user-facing remedy is different
// (reconnect GitHub vs retry vs nothing). 502 is used for upstream failures
// where the GitHub API misbehaved; 401/403 split tracks token vs scope.

export class GitHubTokenExpired extends Schema.TaggedError<GitHubTokenExpired>()(
  "GitHubTokenExpired",
  {},
  { httpApiStatus: 401 }
) {}

export class GitHubScopeInsufficient extends Schema.TaggedError<GitHubScopeInsufficient>()(
  "GitHubScopeInsufficient",
  {},
  { httpApiStatus: 403 }
) {}

export class RepoGone extends Schema.TaggedError<RepoGone>()(
  "RepoGone",
  {},
  { httpApiStatus: 410 }
) {}

export class BranchExists extends Schema.TaggedError<BranchExists>()(
  "BranchExists",
  { branch: Schema.String },
  { httpApiStatus: 409 }
) {}

export class BranchProtected extends Schema.TaggedError<BranchProtected>()(
  "BranchProtected",
  { branch: Schema.String },
  { httpApiStatus: 422 }
) {}

// Carries the unix-seconds reset timestamp so the UI can show a countdown.
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { resetAt: Schema.Finite },
  { httpApiStatus: 429 }
) {}

export class GitHubError extends Schema.TaggedError<GitHubError>()(
  "GitHubError",
  { message: Schema.String },
  { httpApiStatus: 502 }
) {
  static invalidResponse(
    operation: "fetchProjectStateBatch" | "discoverProjectBranches",
    cause: unknown
  ) {
    const message =
      operation === "fetchProjectStateBatch"
        ? "GitHub returned an invalid pull-request page"
        : "GitHub returned an invalid branch discovery response"
    const error = new GitHubError({ message })
    Object.defineProperty(error, "operation", {
      configurable: true,
      value: operation,
      writable: false
    })
    Object.defineProperty(error, "cause", {
      configurable: true,
      value: cause,
      writable: false
    })
    return error
  }
}

// 404 — caller asked us to attach an existing branch but it isn't on the
// remote (deleted between list and submit, or typo). The UI should refresh
// the branch list and keep the form open.
export class BranchNotFound extends Schema.TaggedError<BranchNotFound>()(
  "BranchNotFound",
  { name: Schema.String },
  { httpApiStatus: 404 }
) {}

export class SprintCompletedImmutable extends Schema.TaggedError<SprintCompletedImmutable>()(
  "SprintCompletedImmutable",
  {},
  { httpApiStatus: 409 }
) {}

export class EverhourApiKeyMissing extends Schema.TaggedError<EverhourApiKeyMissing>()(
  "EverhourApiKeyMissing",
  {},
  { httpApiStatus: 401 }
) {}

export class EverhourAuthInvalid extends Schema.TaggedError<EverhourAuthInvalid>()(
  "EverhourAuthInvalid",
  {},
  { httpApiStatus: 401 }
) {}

export class EverhourProjectAccessDenied extends Schema.TaggedError<EverhourProjectAccessDenied>()(
  "EverhourProjectAccessDenied",
  {},
  { httpApiStatus: 403 }
) {}

export class EverhourRateLimited extends Schema.TaggedError<EverhourRateLimited>()(
  "EverhourRateLimited",
  { retryAfterSeconds: Schema.Finite },
  { httpApiStatus: 429 }
) {}

export class EverhourConfigMissing extends Schema.TaggedError<EverhourConfigMissing>()(
  "EverhourConfigMissing",
  {},
  { httpApiStatus: 503 }
) {}

export class EverhourError extends Schema.TaggedError<EverhourError>()(
  "EverhourError",
  { message: Schema.String },
  { httpApiStatus: 502 }
) {}

export class StorageNotConnected extends Schema.TaggedError<StorageNotConnected>()(
  "StorageNotConnected",
  {},
  { httpApiStatus: 409 }
) {}

export class StorageAuthInvalid extends Schema.TaggedError<StorageAuthInvalid>()(
  "StorageAuthInvalid",
  {},
  { httpApiStatus: 401 }
) {}

export class StorageConfigMissing extends Schema.TaggedError<StorageConfigMissing>()(
  "StorageConfigMissing",
  {},
  { httpApiStatus: 503 }
) {}

export class ImportFormatUnsupported extends Schema.TaggedError<ImportFormatUnsupported>()(
  "ImportFormatUnsupported",
  { fileVersion: Schema.Int, supportedVersion: Schema.Int },
  { httpApiStatus: 422 }
) {}

export class StorageError extends Schema.TaggedError<StorageError>()(
  "StorageError",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}

export class AttachmentTooLarge extends Schema.TaggedError<AttachmentTooLarge>()(
  "AttachmentTooLarge",
  { maxBytes: Schema.Finite },
  { httpApiStatus: 413 }
) {}

export class AttachmentTypeRejected extends Schema.TaggedError<AttachmentTypeRejected>()(
  "AttachmentTypeRejected",
  { contentType: Schema.String },
  { httpApiStatus: 415 }
) {}

export class AttachmentNotUploaded extends Schema.TaggedError<AttachmentNotUploaded>()(
  "AttachmentNotUploaded",
  {},
  { httpApiStatus: 409 }
) {}

export class FigmaNotConnected extends Schema.TaggedError<FigmaNotConnected>()(
  "FigmaNotConnected",
  {},
  { httpApiStatus: 409 }
) {}

export class FigmaAuthInvalid extends Schema.TaggedError<FigmaAuthInvalid>()(
  "FigmaAuthInvalid",
  {},
  { httpApiStatus: 401 }
) {}

export class FigmaRateLimited extends Schema.TaggedError<FigmaRateLimited>()(
  "FigmaRateLimited",
  { retryAfterSeconds: Schema.Finite },
  { httpApiStatus: 429 }
) {}

export class FigmaFileNotFound extends Schema.TaggedError<FigmaFileNotFound>()(
  "FigmaFileNotFound",
  { fileKey: Schema.String },
  { httpApiStatus: 404 }
) {}

export class FigmaError extends Schema.TaggedError<FigmaError>()(
  "FigmaError",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}

export class JiraNotConnected extends Schema.TaggedError<JiraNotConnected>()(
  "JiraNotConnected",
  {},
  { httpApiStatus: 409 }
) {}

export class JiraReconnectRequired extends Schema.TaggedError<JiraReconnectRequired>()(
  "JiraReconnectRequired",
  { reason: JiraReconnectReason },
  { httpApiStatus: 401 }
) {}

export class JiraAccessDenied extends Schema.TaggedError<JiraAccessDenied>()(
  "JiraAccessDenied",
  {
    status: Schema.optional(Schema.Int),
    operation: Schema.optional(Schema.String)
  },
  { httpApiStatus: 403 }
) {}

export class JiraResourceNotFound extends Schema.TaggedError<JiraResourceNotFound>()(
  "JiraResourceNotFound",
  { operation: Schema.optional(Schema.String) },
  { httpApiStatus: 404 }
) {}

export class JiraRateLimited extends Schema.TaggedError<JiraRateLimited>()(
  "JiraRateLimited",
  { retryAfterSeconds: Schema.Finite },
  { httpApiStatus: 429 }
) {}

export class JiraError extends Schema.TaggedError<JiraError>()(
  "JiraError",
  {
    reason: JiraFailureReason,
    status: Schema.optional(Schema.Int),
    operation: Schema.optional(Schema.String),
    errorMessages: Schema.optional(Schema.Array(Schema.String)),
    path: Schema.optional(Schema.String)
  },
  { httpApiStatus: 502 }
) {}

export class JiraMigrationUnavailable extends Schema.TaggedError<JiraMigrationUnavailable>()(
  "JiraMigrationUnavailable",
  { reason: Schema.Literals(["worker_unavailable", "storage_unavailable"]) },
  { httpApiStatus: 503 }
) {}

export class UnknownType extends Schema.TaggedError<UnknownType>()(
  "UnknownType",
  { key: Schema.String },
  { httpApiStatus: 400 }
) {}

export class UnknownStatus extends Schema.TaggedError<UnknownStatus>()(
  "UnknownStatus",
  { status: Schema.String },
  { httpApiStatus: 400 }
) {}

export class UnknownTags extends Schema.TaggedError<UnknownTags>()(
  "UnknownTags",
  { tags: Schema.Array(Schema.String) },
  { httpApiStatus: 400 }
) {}

export class NonMemberAssignees extends Schema.TaggedError<NonMemberAssignees>()(
  "NonMemberAssignees",
  { userIds: Schema.Array(Schema.String) },
  { httpApiStatus: 400 }
) {}

export class EstimationOff extends Schema.TaggedError<EstimationOff>()(
  "EstimationOff",
  {},
  { httpApiStatus: 400 }
) {}

export class EstimateUnitMismatch extends Schema.TaggedError<EstimateUnitMismatch>()(
  "EstimateUnitMismatch",
  { unit: Schema.String, estimation: Schema.String },
  { httpApiStatus: 400 }
) {}

export const HierarchyInvalidKind = Schema.Literals([
  "epic_in_sprint",
  "epic_with_parent",
  "invalid_parent",
  "epic_has_tickets",
  "ticket_has_sub_tickets"
])

export class HierarchyInvalid extends Schema.TaggedError<HierarchyInvalid>()(
  "HierarchyInvalid",
  { kind: HierarchyInvalidKind },
  { httpApiStatus: 400 }
) {}

export const RelationInvalidKind = Schema.Literals([
  "relation_self",
  "unknown_tickets",
  "blocking_cycle",
  "duplicate_of_duplicate",
  "has_duplicates"
])
export type RelationInvalidKind = typeof RelationInvalidKind.Type

export class RelationInvalid extends Schema.TaggedError<RelationInvalid>()(
  "RelationInvalid",
  { kind: RelationInvalidKind, ids: Schema.Array(Schema.String) },
  { httpApiStatus: 400 }
) {}

export class InvalidBlocks extends Schema.TaggedError<InvalidBlocks>()(
  "InvalidBlocks",
  { code: BlockIssueCode, line: Schema.Int, source: Schema.String },
  { httpApiStatus: 400 }
) {}

export class LibraryContentRejected extends Schema.TaggedError<LibraryContentRejected>()(
  "LibraryContentRejected",
  { kind: Schema.Literals(["attachments_not_allowed", "blocks_not_allowed"]) },
  { httpApiStatus: 400 }
) {}

export class BodyEditFailed extends Schema.TaggedError<BodyEditFailed>()(
  "BodyEditFailed",
  { index: Schema.Int, failure: TicketBodyEditFailure },
  { httpApiStatus: 400 }
) {}

export class TicketMoveRejected extends Schema.TaggedError<TicketMoveRejected>()(
  "TicketMoveRejected",
  {
    kind: Schema.Literals([
      "same_project",
      "epic_has_tickets",
      "destination_no_statuses"
    ])
  },
  { httpApiStatus: 400 }
) {}

export class SprintInvalid extends Schema.TaggedError<SprintInvalid>()(
  "SprintInvalid",
  {
    kind: Schema.Literals([
      "invalid_interval",
      "completed_in_future",
      "completed_before_start",
      "destination_is_source",
      "destination_not_sprint",
      "not_a_sprint"
    ])
  },
  { httpApiStatus: 400 }
) {}

export const ProjectImportInvalidKind = Schema.Literals([
  "archive_too_large",
  "attachment_size_mismatch",
  "entry_too_large",
  "invalid_archive",
  "invalid_manifest",
  "invalid_type_definition",
  "linked_user_not_in_org",
  "manifest_must_come_first",
  "markdown_too_large",
  "missing_manifest",
  "unexpected_attachment",
  "unexpected_entry",
  "unsafe_path",
  "upload_interrupted"
])
export type ProjectImportInvalidKind = typeof ProjectImportInvalidKind.Type

export class ProjectImportInvalid extends Schema.TaggedError<ProjectImportInvalid>()(
  "ProjectImportInvalid",
  { kind: ProjectImportInvalidKind },
  { httpApiStatus: 400 }
) {}

export class ProjectImportStateConflict extends Schema.TaggedError<ProjectImportStateConflict>()(
  "ProjectImportStateConflict",
  { kind: Schema.Literals(["not_cancellable", "not_ready"]) },
  { httpApiStatus: 409 }
) {}

export const CommentBodyInvalidKind = Schema.Literals([
  "empty",
  "contains_marker_pattern"
])
export type CommentBodyInvalidKind = typeof CommentBodyInvalidKind.Type

export class CommentBodyInvalid extends Schema.TaggedError<CommentBodyInvalid>()(
  "CommentBodyInvalid",
  { kind: CommentBodyInvalidKind },
  { httpApiStatus: 400 }
) {}

export class CommentThreadResolved extends Schema.TaggedError<CommentThreadResolved>()(
  "CommentThreadResolved",
  {},
  { httpApiStatus: 409 }
) {}

export class JiraMigrationRejected extends Schema.TaggedError<JiraMigrationRejected>()(
  "JiraMigrationRejected",
  {
    kind: Schema.Literals([
      "not_configurable",
      "scan_incomplete",
      "run_not_allowed",
      "rescan_not_allowed",
      "cancel_not_allowed",
      "discard_not_allowed",
      "cleanup_failed"
    ])
  },
  { httpApiStatus: 400 }
) {}

export class JiraMigrationChanged extends Schema.TaggedError<JiraMigrationChanged>()(
  "JiraMigrationChanged",
  { kind: Schema.Literals(["revision", "request"]) },
  { httpApiStatus: 409 }
) {}

export class FeedbackRejected extends Schema.TaggedError<FeedbackRejected>()(
  "FeedbackRejected",
  {
    kind: Schema.Literals([
      "attachment_already_sent",
      "duplicate_attachment",
      "empty_attachment",
      "unknown_attachment",
      "invalid_report"
    ])
  },
  { httpApiStatus: 400 }
) {}

export class FeedbackInProgress extends Schema.TaggedError<FeedbackInProgress>()(
  "FeedbackInProgress",
  {},
  { httpApiStatus: 409 }
) {}

export class UploadFailed extends Schema.TaggedError<UploadFailed>()(
  "UploadFailed",
  { kind: Schema.Literals(["timed_out", "unreadable_body"]) },
  { httpApiStatus: 400 }
) {}

export class AvatarSourceUnavailable extends Schema.TaggedError<AvatarSourceUnavailable>()(
  "AvatarSourceUnavailable",
  { source: Schema.String },
  { httpApiStatus: 400 }
) {}

export class OAuthConsentRejected extends Schema.TaggedError<OAuthConsentRejected>()(
  "OAuthConsentRejected",
  {},
  { httpApiStatus: 400 }
) {}

export class TicketChanged extends Schema.TaggedError<TicketChanged>()(
  "TicketChanged",
  {
    kind: Schema.Literals([
      "updated_since_read",
      "body_changed",
      "move_ticket_changed",
      "move_id_taken",
      "sprint_membership_changed"
    ])
  },
  { httpApiStatus: 409 }
) {}

export class TicketArchiveConflict extends Schema.TaggedError<TicketArchiveConflict>()(
  "TicketArchiveConflict",
  { kind: Schema.Literals(["already_archived", "not_archived"]) },
  { httpApiStatus: 409 }
) {}

export class ProjectIdentifierTaken extends Schema.TaggedError<ProjectIdentifierTaken>()(
  "ProjectIdentifierTaken",
  { kind: Schema.Literals(["key", "slug"]) },
  { httpApiStatus: 409 }
) {}

export class TagExists extends Schema.TaggedError<TagExists>()(
  "TagExists",
  {},
  { httpApiStatus: 409 }
) {}

export class LibraryConflict extends Schema.TaggedError<LibraryConflict>()(
  "LibraryConflict",
  { kind: Schema.Literals(["key_taken", "customized"]) },
  { httpApiStatus: 409 }
) {}

export class StatusChangeRejected extends Schema.TaggedError<StatusChangeRejected>()(
  "StatusChangeRejected",
  {
    kind: Schema.Literals([
      "baseline_order",
      "invalid_label",
      "reassign_required",
      "reassign_target_invalid",
      "reassign_target_missing",
      "reserved_slug",
      "slug_exists"
    ])
  },
  { httpApiStatus: 409 }
) {}

export const OrgConflictKind = Schema.Literals([
  "already_member",
  "already_invited",
  "last_owner",
  "last_owner_removal",
  "membership_limit",
  "invitation_limit",
  "inviter_left",
  "slug_taken"
])
export type OrgConflictKind = typeof OrgConflictKind.Type

export class OrgConflict extends Schema.TaggedError<OrgConflict>()(
  "OrgConflict",
  { kind: OrgConflictKind },
  { httpApiStatus: 409 }
) {}

export class OrgRestoreRejected extends Schema.TaggedError<OrgRestoreRejected>()(
  "OrgRestoreRejected",
  { kind: Schema.Literals(["grace_expired", "not_deleted"]) },
  { httpApiStatus: 409 }
) {}

export class GitHubConnectionConflict extends Schema.TaggedError<GitHubConnectionConflict>()(
  "GitHubConnectionConflict",
  {
    kind: Schema.Literals([
      "installation_connected_elsewhere",
      "installation_not_available",
      "repo_already_connected",
      "no_connection"
    ])
  },
  { httpApiStatus: 409 }
) {}

export class BranchLinkConflict extends Schema.TaggedError<BranchLinkConflict>()(
  "BranchLinkConflict",
  {
    kind: Schema.Literals([
      "already_on_ticket",
      "on_other_ticket",
      "not_stacked",
      "no_branch"
    ])
  },
  { httpApiStatus: 409 }
) {}

export class SlackConnectionConflict extends Schema.TaggedError<SlackConnectionConflict>()(
  "SlackConnectionConflict",
  {
    kind: Schema.Literals([
      "disconnect_first",
      "identity_connected",
      "workspace_connected"
    ])
  },
  { httpApiStatus: 409 }
) {}

export const TicketFieldErrors = [
  Validation,
  UnknownType,
  UnknownStatus,
  UnknownTags,
  NonMemberAssignees,
  EstimationOff,
  EstimateUnitMismatch,
  HierarchyInvalid,
  RelationInvalid
] as const
