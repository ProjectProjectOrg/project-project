import type {
  Forbidden,
  NotFound,
  SlackAuthInvalid,
  SlackError,
  SlackNotConnected,
  SlackRateLimited,
  Unauthorized
} from "@pp/shared"
import type { OrgEmailError } from "@pp/shared"
import {
  FigmaAuthInvalid,
  ImportFormatUnsupported,
  InvalidRequest,
  FigmaError,
  FigmaFileNotFound,
  FigmaNotConnected,
  FigmaRateLimited
} from "@pp/shared"
import type {
  AttachmentNotUploaded,
  BlockIssueCode,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  BranchExists,
  BranchNotFound,
  BranchProtected,
  EverhourApiKeyMissing,
  EverhourAuthInvalid,
  EverhourConfigMissing,
  EverhourError,
  EverhourProjectAccessDenied,
  EverhourRateLimited,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  InvitationNotAcceptable,
  JiraAccessDenied,
  JiraError,
  JiraMigrationUnavailable,
  JiraNotConnected,
  JiraRateLimited,
  JiraReconnectRequired,
  JiraResourceNotFound,
  LastProjectPmBlocked,
  MentionInvalid,
  RateLimited,
  RepoGone,
  SprintCompletedImmutable,
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  Validation
} from "@pp/shared"
import type {
  BodyEditFailed,
  BranchLinkConflict,
  CommentBodyInvalid,
  CommentThreadResolved,
  EstimateUnitMismatch,
  EstimationOff,
  FeedbackInProgress,
  FeedbackRejected,
  NonMemberAssignees,
  OAuthConsentRejected,
  OrgConflict,
  OrgRestoreRejected,
  ProjectImportInvalid,
  ProjectImportStateConflict,
  SprintInvalid,
  StatusChangeRejected,
  TagExists,
  UnknownStatus,
  UnknownTags,
  UploadFailed,
  AvatarSourceUnavailable
} from "@pp/shared"
import {
  EmailFailureReason,
  HierarchyInvalid,
  RelationInvalid,
  TicketMoveRejected,
  InvalidBlocks,
  LibraryContentRejected,
  UnknownType,
  JiraMigrationRejected,
  TicketChanged,
  ProjectIdentifierTaken,
  LibraryConflict,
  SlackConnectionConflict,
  TicketArchiveConflict,
  GitHubConnectionConflict,
  JiraMigrationChanged,
  InvitationNotAcceptableReason
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Match from "effect/Match"
import type * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import type { submitConsentAtom } from "@/features/oauth/atoms/oauthConsent"
import type { InviteAcceptError } from "@/features/organizations/lib/invitations"
import type { createStatus } from "@/features/projects/atoms/projectStatuses"
import { m } from "@/paraglide/messages"

export type AppError =
  | SlackAuthInvalid
  | SlackError
  | SlackNotConnected
  | SlackRateLimited
  | OrgEmailError
  | Unauthorized
  | NotFound
  | Forbidden
  | BodyEditFailed
  | BranchLinkConflict
  | CommentBodyInvalid
  | CommentThreadResolved
  | EstimateUnitMismatch
  | EstimationOff
  | FeedbackInProgress
  | FeedbackRejected
  | GitHubConnectionConflict
  | HierarchyInvalid
  | InvalidBlocks
  | JiraMigrationChanged
  | JiraMigrationRejected
  | LibraryConflict
  | LibraryContentRejected
  | NonMemberAssignees
  | OAuthConsentRejected
  | OrgConflict
  | OrgRestoreRejected
  | ProjectIdentifierTaken
  | ProjectImportInvalid
  | ProjectImportStateConflict
  | RelationInvalid
  | SlackConnectionConflict
  | SprintInvalid
  | StatusChangeRejected
  | TagExists
  | TicketArchiveConflict
  | TicketChanged
  | TicketMoveRejected
  | UnknownStatus
  | UnknownTags
  | UnknownType
  | UploadFailed
  | AvatarSourceUnavailable
  | EverhourApiKeyMissing
  | EverhourAuthInvalid
  | EverhourConfigMissing
  | EverhourError
  | EverhourProjectAccessDenied
  | EverhourRateLimited
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
  | InvitationNotAcceptable
  | InviteAcceptError
  | LastProjectPmBlocked
  | StorageAuthInvalid
  | StorageConfigMissing
  | StorageError
  | StorageNotConnected
  | AttachmentTooLarge
  | AttachmentTypeRejected
  | AttachmentNotUploaded
  | FigmaNotConnected
  | FigmaAuthInvalid
  | FigmaRateLimited
  | FigmaFileNotFound
  | FigmaError
  | JiraNotConnected
  | JiraReconnectRequired
  | JiraAccessDenied
  | JiraResourceNotFound
  | JiraRateLimited
  | JiraError
  | JiraMigrationUnavailable
  | ImportFormatUnsupported
  | InvalidRequest
  | Validation

const invitationNotAcceptableMessage = (
  reason: InvitationNotAcceptableReason
) => {
  switch (reason) {
    case "expired":
      return m.auth_invites_accept_error_expired()
    case "not_recipient":
      return m.auth_invites_accept_error_not_recipient()
    case "email_verification_required":
      return m.auth_invites_accept_error_email_verification_required()
    case "membership_limit_reached":
      return m.auth_invites_accept_error_membership_limit_reached()
  }
}

const BLOCK_ISSUE_MESSAGES = {
  unclosed: m.templates_error_block_unclosed,
  stray_close: m.templates_error_block_stray_close,
  nested: m.templates_error_block_nested,
  malformed_open: m.templates_error_block_malformed_open,
  invalid_type: m.templates_error_block_invalid_type
} satisfies Record<
  BlockIssueCode,
  (inputs: Readonly<{ line: string }>) => string
>

const RELATION_MESSAGES = {
  relation_self: () => m.tickets_error_relation_self(),
  unknown_tickets: (ids) =>
    m.tickets_error_unknown_tickets({ ids: ids.join(", ") }),
  blocking_cycle: (ids) =>
    m.tickets_error_blocking_cycle({ chain: ids.join(" → ") }),
  duplicate_of_duplicate: ([ticket = "", original = ""]) =>
    m.tickets_error_duplicate_of_duplicate({ ticket, original }),
  has_duplicates: (ids) =>
    m.tickets_error_has_duplicates({ ids: ids.join(", ") })
} satisfies Record<
  RelationInvalid["kind"],
  (ids: RelationInvalid["ids"]) => string
>

const slackMessage = ({ reason }: SlackError) => {
  switch (reason) {
    case "encryption":
      return m.slack_error_encryption()
    case "not_in_channel":
      return m.slack_error_channel()
    case "app_mismatch":
      return m.slack_error_app_mismatch()
    default:
      return m.slack_error_generic()
  }
}

type Messages = {
  readonly [K in AppError["_tag"]]: (
    error: Extract<AppError, Readonly<{ _tag: K }>>
  ) => string
}

const messages: Messages = {
  Unauthorized: () => m.error_unknown(),
  Forbidden: () => m.error_forbidden(),
  NotFound: () => m.error_unknown(),
  InvalidRequest: () => m.error_invalid_request(),
  Validation: () => m.error_unknown(),
  InvitationNotAcceptable: ({ reason }) =>
    invitationNotAcceptableMessage(reason),
  InviteExpired: () => m.auth_invites_accept_error_expired(),
  InviteNotFound: () => m.auth_invites_accept_error_not_found(),
  InviteNotRecipient: () => m.auth_invites_accept_error_not_recipient(),
  InviteEmailVerificationRequired: () =>
    m.auth_invites_accept_error_email_verification_required(),
  InviteAcceptFailed: () => m.auth_invites_accept_row_error(),
  LastProjectPmBlocked: () => m.members_last_pm_error(),
  OrgConflict: () => m.error_unknown(),
  OrgRestoreRejected: ({ kind }) =>
    kind === "grace_expired"
      ? m.org_deleted_restore_grace_expired()
      : m.org_deleted_restore_error(),
  OrgEmailError: ({ reason }) => emailFailureMessage(reason),
  OAuthConsentRejected: () => m.auth_oauth_consent_error_invalid_link(),
  AvatarSourceUnavailable: () => m.error_unknown(),
  SprintCompletedImmutable: () => m.error_sprint_completed_immutable(),
  SprintInvalid: () => m.error_unknown(),
  MentionInvalid: () => m.error_mention_invalid(),
  HierarchyInvalid: ({ kind }) =>
    ({
      epic_in_sprint: m.tickets_error_epic_in_sprint,
      epic_has_tickets: m.tickets_error_epic_has_tickets,
      epic_with_parent: m.tickets_error_epic_with_parent,
      invalid_parent: m.tickets_error_invalid_parent,
      ticket_has_sub_tickets: m.tickets_error_ticket_has_sub_tickets
    })[kind](),
  RelationInvalid: ({ kind, ids }) => RELATION_MESSAGES[kind](ids),
  TicketMoveRejected: ({ kind }) =>
    ({
      same_project: m.tickets_move_error_same_project,
      epic_has_tickets: m.tickets_move_error_epic_has_tickets,
      destination_no_statuses: m.tickets_move_error_no_statuses
    })[kind](),
  TicketChanged: ({ kind }) =>
    kind === "move_ticket_changed" || kind === "move_id_taken"
      ? m.tickets_move_error_changed()
      : m.error_unknown(),
  TicketArchiveConflict: ({ kind }) =>
    kind === "already_archived"
      ? m.tickets_archive_error_already_archived()
      : m.tickets_unarchive_error_not_archived(),
  UnknownType: ({ key }) => m.templates_error_unknown_template({ key }),
  UnknownStatus: () => m.error_unknown(),
  UnknownTags: () => m.error_unknown(),
  NonMemberAssignees: () => m.error_unknown(),
  EstimationOff: () => m.error_unknown(),
  EstimateUnitMismatch: () => m.error_unknown(),
  BodyEditFailed: () => m.error_unknown(),
  CommentBodyInvalid: () => m.error_unknown(),
  CommentThreadResolved: () => m.error_unknown(),
  InvalidBlocks: ({ code, line }) =>
    BLOCK_ISSUE_MESSAGES[code]({ line: String(line) }),
  LibraryContentRejected: ({ kind }) =>
    kind === "attachments_not_allowed"
      ? m.templates_error_attachments_not_allowed()
      : m.templates_error_blocks_not_allowed(),
  LibraryConflict: ({ kind }) =>
    kind === "key_taken" ? m.templates_error_key_taken() : m.error_unknown(),
  StatusChangeRejected: () => m.error_unknown(),
  TagExists: () => m.error_unknown(),
  ProjectIdentifierTaken: ({ kind }) =>
    kind === "key" ? m.projects_create_key_taken_error() : m.error_unknown(),
  ProjectImportInvalid: () => m.error_unknown(),
  ProjectImportStateConflict: () => m.error_unknown(),
  ImportFormatUnsupported: ({ fileVersion, supportedVersion }) =>
    m.project_import_error_format_unsupported({
      fileVersion: String(fileVersion),
      supportedVersion: String(supportedVersion)
    }),
  FeedbackRejected: () => m.error_unknown(),
  FeedbackInProgress: () => m.error_unknown(),
  UploadFailed: () => m.error_unknown(),
  StorageAuthInvalid: () => m.storage_error_auth(),
  StorageConfigMissing: () => m.storage_error_config(),
  StorageError: () => m.storage_error_unreachable(),
  StorageNotConnected: () => m.storage_error_unreachable(),
  AttachmentTooLarge: ({ maxBytes }) =>
    m.editor_attachment_too_large({
      limit: Math.round(maxBytes / (1024 * 1024))
    }),
  AttachmentTypeRejected: () => m.editor_attachment_type_rejected(),
  AttachmentNotUploaded: () => m.editor_attachment_upload_failed(),
  GitHubConnectionConflict: ({ kind }) =>
    kind === "installation_not_available"
      ? m.github_chip_connect_installation_unavailable_error()
      : m.error_unknown(),
  BranchLinkConflict: () => m.error_unknown(),
  GitHubTokenExpired: () => m.error_unknown(),
  GitHubScopeInsufficient: () => m.error_unknown(),
  RepoGone: () => m.error_unknown(),
  BranchExists: () => m.error_unknown(),
  BranchProtected: () => m.error_unknown(),
  BranchNotFound: () => m.error_unknown(),
  RateLimited: () => m.error_github_rate_limited(),
  GitHubError: () => m.error_unknown(),
  SlackAuthInvalid: () => m.slack_error_auth(),
  SlackNotConnected: () => m.slack_error_not_connected(),
  SlackRateLimited: ({ retryAfterSeconds }) =>
    m.slack_error_rate_limited({ seconds: String(retryAfterSeconds) }),
  SlackError: slackMessage,
  SlackConnectionConflict: ({ kind }) =>
    ({
      disconnect_first: m.slack_error_disconnect_first,
      workspace_connected: m.slack_error_workspace_connected,
      identity_connected: m.error_unknown
    })[kind](),
  EverhourApiKeyMissing: () => m.error_everhour_api_key_missing(),
  EverhourAuthInvalid: () => m.error_everhour_auth_invalid(),
  EverhourConfigMissing: () => m.error_everhour_config_missing(),
  EverhourProjectAccessDenied: () => m.error_everhour_project_access_denied(),
  EverhourRateLimited: ({ retryAfterSeconds }) =>
    m.error_everhour_rate_limited({ seconds: String(retryAfterSeconds) }),
  EverhourError: ({ message }) => m.error_everhour_upstream({ message }),
  FigmaNotConnected: () => m.figma_error_not_connected(),
  FigmaAuthInvalid: () => m.figma_error_auth_invalid(),
  FigmaRateLimited: () => m.figma_error_rate_limited(),
  FigmaFileNotFound: () => m.figma_error_file_not_found(),
  FigmaError: () => m.figma_error_generic(),
  JiraNotConnected: () => m.jira_import_error_not_connected(),
  JiraReconnectRequired: () => m.jira_import_error_reconnect(),
  JiraAccessDenied: () => m.jira_import_error_access_denied(),
  JiraResourceNotFound: () => m.jira_import_error_not_found(),
  JiraRateLimited: ({ retryAfterSeconds }) =>
    m.jira_import_error_rate_limited({
      seconds: String(Math.max(1, Math.ceil(retryAfterSeconds)))
    }),
  JiraError: () => m.jira_import_error_unreachable(),
  JiraMigrationUnavailable: ({ reason }) =>
    reason === "storage_unavailable"
      ? m.jira_import_error_storage()
      : m.jira_import_error_worker(),
  JiraMigrationRejected: ({ kind }) =>
    kind === "cleanup_failed"
      ? m.error_unknown()
      : m.jira_import_error_moved_on(),
  JiraMigrationChanged: () => m.jira_import_error_changed_elsewhere()
}

const isTagged = Schema.is(Schema.Struct({ _tag: Schema.String }))

const isAppError = (error: unknown): error is AppError =>
  isTagged(error) && Object.hasOwn(messages, error._tag)

export const appErrorMessage = (error: AppError) =>
  Match.valueTags(error, messages)

export const errorMessage = Match.type<unknown>().pipe(
  Match.when(isAppError, appErrorMessage),
  Match.orElse(() => m.error_unknown())
)

export const figmaStatusErrorMessage = (reason: string) => {
  const error: AppError = (() => {
    switch (reason) {
      case "figma_not_connected":
        return new FigmaNotConnected()
      case "figma_auth_invalid":
        return new FigmaAuthInvalid()
      case "figma_rate_limited":
        return new FigmaRateLimited({ retryAfterSeconds: 60 })
      case "figma_file_not_found":
        return new FigmaFileNotFound({ fileKey: "" })
      default:
        return new FigmaError({ reason })
    }
  })()
  return errorMessage(error)
}

type StatusSaveFailure = Atom.Failure<ReturnType<typeof createStatus>>
type OAuthConsentFailure = Atom.Failure<ReturnType<typeof submitConsentAtom>>

export const statusSaveErrorMessage = (
  error: StatusSaveFailure,
  fallback: () => string = m.tickets_status_create_error_fallback
) =>
  Match.value(error).pipe(
    Match.tag("StatusChangeRejected", ({ kind }) => {
      switch (kind) {
        case "reserved_slug":
          return m.tickets_status_validation_reserved()
        case "slug_exists":
          return m.tickets_status_validation_slug_exists()
        case "invalid_label":
          return m.tickets_status_validation_invalid_label()
        default:
          return fallback()
      }
    }),
    Match.orElse(fallback)
  )

export const oauthConsentErrorMessage = (error: OAuthConsentFailure) =>
  Match.value(error).pipe(
    Match.tag("OAuthConsentRejected", () =>
      m.auth_oauth_consent_error_invalid_link()
    ),
    Match.tag("Unauthorized", () => m.auth_oauth_consent_error_session()),
    Match.orElse(() => m.auth_oauth_consent_error_retry())
  )

export const emailFailureMessage = (reason: EmailFailureReason) =>
  ({
    authentication: m.org_email_error_authentication,
    connection: m.org_email_error_connection,
    host_not_allowed: m.org_email_error_host_not_allowed,
    tls: m.org_email_error_tls,
    sender: m.org_email_error_sender,
    delivery: m.org_email_error_delivery,
    not_configured: m.org_email_error_not_configured,
    encryption: m.org_email_error_encryption,
    password_required: m.org_email_error_password_required,
    settings_changed: m.org_email_error_settings_changed
  })[reason]()

export const describeCause = (cause: Cause.Cause<unknown>) =>
  errorMessage(Cause.squash(cause))
