import { Match, Option, Schema } from "effect"
import {
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
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
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  Unauthorized,
  Validation
} from "@projectproject/shared"

export interface McpToolErrorResult {
  readonly content: ReadonlyArray<{
    readonly type: "text"
    readonly text: string
  }>
  readonly isError: true
}

const text = (value: string): McpToolErrorResult => ({
  content: [{ type: "text", text: value }],
  isError: true
})

const TaggedError = <const Tag extends string>(tag: Tag) =>
  Schema.TaggedStruct(tag, {})

const ToolError = Schema.Union([
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  Validation,
  MentionInvalid,
  StorageNotConnected,
  StorageConfigMissing,
  StorageError,
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  TaggedError("MarkdownError"),
  TaggedError("BetterAuthError"),
  TaggedError("TicketIdTaken"),
  TaggedError("GroupIdTaken"),
  SprintCompletedImmutable,
  BranchNotFound,
  BranchExists,
  BranchProtected,
  GitHubTokenExpired,
  GitHubScopeInsufficient,
  RepoGone,
  RateLimited,
  GitHubError
])

const decodeToolError = Schema.decodeUnknownOption(ToolError)

export const mapToolError = (error: unknown): McpToolErrorResult => {
  if (Schema.isSchemaError(error)) {
    return text(`Validation error: ${error.message}`)
  }
  const decoded = decodeToolError(error)
  if (Option.isNone(decoded)) return text("Internal error.")

  return Match.value(decoded.value).pipe(
    Match.tagsExhaustive({
      Unauthorized: () => text("Unauthorized."),
      Forbidden: () => text("Forbidden."),
      NotFound: () => text("Not found."),
      Conflict: (error) =>
        text(error.reason ? `Conflict (${error.reason}).` : "Conflict."),
      Validation: (error) =>
        text(
          error.reason
            ? `Validation error (${error.reason}).`
            : "Validation error."
        ),
      MentionInvalid: (error) => {
        const detail =
          error.kind && error.href
            ? `${error.kind}: ${error.href}`
            : (error.kind ?? error.href ?? "")
        return text(
          detail
            ? `Mention error (${detail}). Use [label](mention:user/<id>) or [label](mention:ticket/<T-N>); discover ids via list_members and list_tickets.`
            : "Mention error."
        )
      },
      StorageNotConnected: () =>
        text(
          "StorageNotConnected: Attachments are unavailable because this organization has not connected storage. Connect storage in organization settings, then retry."
        ),
      StorageConfigMissing: () =>
        text(
          "StorageConfigMissing: Server storage configuration is missing. Ask the server administrator to configure attachment storage, then retry."
        ),
      StorageError: () =>
        text(
          "StorageError: Attachment storage could not complete the operation. Check the connection in organization settings and retry."
        ),
      AttachmentNotUploaded: () =>
        text(
          "AttachmentNotUploaded: The uploaded object could not be verified. Retry the POST to uploadUrl. If the upload URL expired, prepare a new upload."
        ),
      AttachmentTooLarge: (error) => {
        const limit = error.maxBytes
          ? `${error.maxBytes / (1024 * 1024)} MiB`
          : "the server limit"
        return text(
          `AttachmentTooLarge: The file must be non-empty and at most ${limit}.`
        )
      },
      AttachmentTypeRejected: () =>
        text(
          "AttachmentTypeRejected: Use PNG, JPEG, GIF, WebP, AVIF, PDF, ZIP, gzip, or tar."
        ),
      MarkdownError: () => text("Document read failed."),
      BetterAuthError: () => text("Auth provider error."),
      TicketIdTaken: () => text("Identifier already taken."),
      GroupIdTaken: () => text("Identifier already taken."),
      SprintCompletedImmutable: () =>
        text("Sprint is already completed and cannot be modified."),
      BranchNotFound: (error) =>
        text(
          error.name
            ? `Branch not found on remote: ${error.name}.`
            : "Branch not found on remote."
        ),
      BranchExists: (error) =>
        text(
          error.branch
            ? `Branch already exists: ${error.branch}.`
            : "Branch already exists."
        ),
      BranchProtected: () => text("Branch is protected."),
      GitHubTokenExpired: () =>
        text("GitHub token expired — reconnect GitHub."),
      GitHubScopeInsufficient: () =>
        text("GitHub token is missing required scopes."),
      RepoGone: () => text("Connected GitHub repository is gone."),
      RateLimited: () => text("Rate limited by GitHub — retry later."),
      GitHubError: (error) =>
        text(
          error.message ? `GitHub error: ${error.message}.` : "GitHub error."
        )
    })
  )
}
