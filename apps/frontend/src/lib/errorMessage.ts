import type {
  SlackAuthInvalid,
  SlackError,
  SlackNotConnected,
  SlackRateLimited
} from "@pp/shared"
import type { OrgEmailError } from "@pp/shared"
import {
  FigmaAuthInvalid,
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
  Conflict,
  EverhourApiKeyMissing,
  EverhourAuthInvalid,
  EverhourConfigMissing,
  EverhourError,
  EverhourProjectAccessDenied,
  EverhourRateLimited,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  InvitationNotAcceptable,
  LastProjectPmBlocked,
  MentionInvalid,
  NotFound,
  RateLimited,
  RepoGone,
  SprintCompletedImmutable,
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  Unauthorized,
  Validation
} from "@pp/shared"
import { EmailFailureReason, InvitationNotAcceptableReason } from "@pp/shared"
import * as Match from "effect/Match"
import type * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import type { configureJiraMigration } from "@/features/jira/atoms/jiraMigration"
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
  | Conflict
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
  | Validation

const invitationNotAcceptableMessage = (
  reason: InvitationNotAcceptableReason
): string => {
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

const isBlockIssueCode = (code: string): code is BlockIssueCode =>
  Object.hasOwn(BLOCK_ISSUE_MESSAGES, code)

const invalidBlocksMessage = (detail: string): string => {
  const [code = "", line = "?"] = detail.split(":")
  return isBlockIssueCode(code)
    ? BLOCK_ISSUE_MESSAGES[code]({ line })
    : m.templates_error_invalid_blocks({ line })
}

const validationMessage = (reason: string): string => {
  const separator = reason.indexOf(":")
  const kind = separator === -1 ? reason : reason.slice(0, separator)
  const detail = separator === -1 ? "" : reason.slice(separator + 1)
  switch (kind) {
    case "attachments_not_allowed":
      return m.templates_error_attachments_not_allowed()
    case "blocks_not_allowed":
      return m.templates_error_blocks_not_allowed()
    case "invalid_blocks":
      return invalidBlocksMessage(detail)
    case "unknown_template":
      return m.templates_error_unknown_template({ key: detail })
    default:
      return m.error_unknown()
  }
}

const conflictMessage = (reason: string): string => {
  switch (reason) {
    case "project_key_taken":
      return m.projects_create_key_taken_error()
    case "key_taken":
      return m.templates_error_key_taken()
    case "slack_disconnect_first":
      return m.slack_error_disconnect_first()
    case "slack_workspace_connected":
      return m.slack_error_workspace_connected()
    default:
      return m.error_unknown()
  }
}

const isInvitationNotAcceptableDetail = Schema.is(
  Schema.TaggedStruct("InvitationNotAcceptable", {
    reason: InvitationNotAcceptableReason
  })
)
const isConflictDetail = Schema.is(
  Schema.TaggedStruct("Conflict", { reason: Schema.String })
)
const isEverhourRateLimitedDetail = Schema.is(
  Schema.TaggedStruct("EverhourRateLimited", {
    retryAfterSeconds: Schema.Finite
  })
)
const isEverhourErrorDetail = Schema.is(
  Schema.TaggedStruct("EverhourError", { message: Schema.String })
)
const isOrgEmailErrorDetail = Schema.is(
  Schema.TaggedStruct("OrgEmailError", { reason: EmailFailureReason })
)
const isSlackRateLimitedDetail = Schema.is(
  Schema.TaggedStruct("SlackRateLimited", { retryAfterSeconds: Schema.Finite })
)
const isSlackErrorDetail = Schema.is(
  Schema.TaggedStruct("SlackError", { reason: Schema.String })
)
const isValidationDetail = Schema.is(
  Schema.TaggedStruct("Validation", { reason: Schema.String })
)

export const errorMessage = Match.type<unknown>()
  .pipe(
    Match.when(isInvitationNotAcceptableDetail, (error) =>
      invitationNotAcceptableMessage(error.reason)
    ),
    Match.when({ _tag: "InviteExpired" }, () =>
      m.auth_invites_accept_error_expired()
    ),
    Match.when({ _tag: "InviteNotFound" }, () =>
      m.auth_invites_accept_error_not_found()
    ),
    Match.when({ _tag: "InviteNotRecipient" }, () =>
      m.auth_invites_accept_error_not_recipient()
    ),
    Match.when({ _tag: "InviteEmailVerificationRequired" }, () =>
      m.auth_invites_accept_error_email_verification_required()
    ),
    Match.when({ _tag: "InviteAcceptFailed" }, () =>
      m.auth_invites_accept_row_error()
    ),
    Match.when({ _tag: "SprintCompletedImmutable" }, () =>
      m.error_sprint_completed_immutable()
    ),
    Match.when(isConflictDetail, (error) => conflictMessage(error.reason)),
    Match.when({ _tag: "MentionInvalid" }, () => m.error_mention_invalid()),
    Match.when({ _tag: "EverhourApiKeyMissing" }, () =>
      m.error_everhour_api_key_missing()
    ),
    Match.when({ _tag: "EverhourAuthInvalid" }, () =>
      m.error_everhour_auth_invalid()
    ),
    Match.when({ _tag: "EverhourConfigMissing" }, () =>
      m.error_everhour_config_missing()
    ),
    Match.when({ _tag: "EverhourProjectAccessDenied" }, () =>
      m.error_everhour_project_access_denied()
    ),
    Match.when(isEverhourRateLimitedDetail, (error) =>
      m.error_everhour_rate_limited({
        seconds: String(error.retryAfterSeconds)
      })
    ),
    Match.when({ _tag: "EverhourRateLimited" }, () =>
      m.error_everhour_rate_limited({ seconds: "60" })
    ),
    Match.when(isEverhourErrorDetail, (error) =>
      m.error_everhour_upstream({ message: error.message })
    ),
    Match.when({ _tag: "RateLimited" }, () => m.error_github_rate_limited()),
    Match.when({ _tag: "Forbidden" }, () => m.error_forbidden()),
    Match.when({ _tag: "LastProjectPmBlocked" }, () =>
      m.members_last_pm_error()
    ),
    Match.when({ _tag: "Unauthorized" }, () => m.error_unknown())
  )
  .pipe(
    Match.when({ _tag: "StorageAuthInvalid" }, () => m.storage_error_auth()),
    Match.when(isOrgEmailErrorDetail, (error) =>
      emailFailureMessage(error.reason)
    ),
    Match.when({ _tag: "StorageConfigMissing" }, () =>
      m.storage_error_config()
    ),
    Match.when({ _tag: "StorageError" }, () => m.storage_error_unreachable()),
    Match.when({ _tag: "StorageNotConnected" }, () =>
      m.storage_error_unreachable()
    ),
    Match.when({ _tag: "AttachmentTooLarge" }, () =>
      m.editor_attachment_too_large()
    ),
    Match.when({ _tag: "AttachmentTypeRejected" }, () =>
      m.editor_attachment_type_rejected()
    ),
    Match.when({ _tag: "AttachmentNotUploaded" }, () =>
      m.editor_attachment_upload_failed()
    ),
    Match.when({ _tag: "SlackAuthInvalid" }, () => m.slack_error_auth()),
    Match.when({ _tag: "SlackNotConnected" }, () =>
      m.slack_error_not_connected()
    ),
    Match.when(isSlackRateLimitedDetail, ({ retryAfterSeconds }) =>
      m.slack_error_rate_limited({ seconds: String(retryAfterSeconds) })
    ),
    Match.when(isSlackErrorDetail, ({ reason }) =>
      Match.value(reason).pipe(
        Match.when("encryption", () => m.slack_error_encryption()),
        Match.when("not_in_channel", () => m.slack_error_channel()),
        Match.when("app_mismatch", () => m.slack_error_app_mismatch()),
        Match.orElse(() => m.slack_error_generic())
      )
    ),
    Match.when({ _tag: "FigmaNotConnected" }, () =>
      m.figma_error_not_connected()
    ),
    Match.when({ _tag: "FigmaAuthInvalid" }, () =>
      m.figma_error_auth_invalid()
    ),
    Match.when({ _tag: "FigmaRateLimited" }, () =>
      m.figma_error_rate_limited()
    ),
    Match.when({ _tag: "FigmaFileNotFound" }, () =>
      m.figma_error_file_not_found()
    ),
    Match.when({ _tag: "FigmaError" }, () => m.figma_error_generic()),
    Match.when(isValidationDetail, (error) => validationMessage(error.reason)),
    Match.orElse(() => m.error_unknown())
  )

export const figmaStatusErrorMessage = (reason: string): string => {
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

type StatusCreateFailure = Atom.Failure<ReturnType<typeof createStatus>>
type JiraMigrationSaveFailure = Atom.Failure<
  ReturnType<typeof configureJiraMigration>
>
type OAuthConsentFailure = Atom.Failure<ReturnType<typeof submitConsentAtom>>

export const statusCreateErrorMessage = (error: StatusCreateFailure): string =>
  Match.value(error).pipe(
    Match.tag("Conflict", ({ reason }) => {
      switch (reason) {
        case "reserved_slug":
          return m.tickets_status_validation_reserved()
        case "slug_exists":
          return m.tickets_status_validation_slug_exists()
        case "invalid_label":
          return m.tickets_status_validation_invalid_label()
        default:
          return m.tickets_status_create_error_fallback()
      }
    }),
    Match.orElse(() => m.tickets_status_create_error_fallback())
  )

export const jiraMigrationSaveErrorMessage = (
  error: JiraMigrationSaveFailure | undefined
): string =>
  error === undefined
    ? m.jira_migration_error_generic()
    : Match.value(error).pipe(
        Match.tag("Conflict", () => m.jira_migration_save_conflict()),
        Match.tag("JiraReconnectRequired", () =>
          m.jira_migration_reconnect_description()
        ),
        Match.orElse(() => m.jira_migration_error_generic())
      )

export const oauthConsentErrorMessage = (error: OAuthConsentFailure): string =>
  Match.value(error).pipe(
    Match.tag("Validation", () => m.auth_oauth_consent_error_invalid_link()),
    Match.tag("Unauthorized", () => m.auth_oauth_consent_error_session()),
    Match.orElse(() => m.auth_oauth_consent_error_retry())
  )

export const emailFailureMessage = (reason: EmailFailureReason): string =>
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
