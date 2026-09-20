import type * as Schema from "effect/Schema"
import type {
  AttachmentNotUploaded,
  BranchExists,
  BranchProtected,
  McpToolError
} from "@projectproject/shared"
import type { BetterAuthError } from "../Services/BetterAuth"
import type {
  GroupIdTaken,
  MarkdownError,
  TicketIdTaken
} from "../Services/Markdown"

type BackendToolError =
  | AttachmentNotUploaded
  | BetterAuthError
  | BranchExists
  | BranchProtected
  | GroupIdTaken
  | MarkdownError
  | Schema.SchemaError
  | TicketIdTaken

type Messages<E extends { readonly _tag: string }> = {
  readonly [K in E["_tag"]]: (error: Extract<E, { readonly _tag: K }>) => string
}

const catalogMessages: Messages<McpToolError> = {
  Unauthorized: () => "Unauthorized.",
  Forbidden: () => "Forbidden.",
  NotFound: () => "Not found.",
  Conflict: ({ reason }) => (reason ? `Conflict (${reason}).` : "Conflict."),
  Validation: ({ reason }) =>
    reason ? `Validation error (${reason}).` : "Validation error.",
  MentionInvalid: ({ kind, href }) => {
    const detail = kind && href ? `${kind}: ${href}` : (kind ?? href ?? "")
    return detail
      ? `Mention error (${detail}). Use [label](mention:user/<id>) or [label](mention:ticket/<T-N>); discover ids via list_members and list_tickets.`
      : "Mention error."
  },
  StorageNotConnected: () =>
    "StorageNotConnected: Attachments are unavailable because this organization has not connected storage. Connect storage in organization settings, then retry.",
  StorageConfigMissing: () =>
    "StorageConfigMissing: Server storage configuration is missing. Ask the server administrator to configure attachment storage, then retry.",
  StorageError: () =>
    "StorageError: Attachment storage could not complete the operation. Check the connection in organization settings and retry.",
  AttachmentTooLarge: ({ maxBytes }) =>
    `AttachmentTooLarge: The file must be non-empty and at most ${Number.isFinite(maxBytes) ? `${maxBytes / (1024 * 1024)} MiB` : "the server limit"}.`,
  AttachmentTypeRejected: () =>
    "AttachmentTypeRejected: Use PNG, JPEG, GIF, WebP, AVIF, PDF, ZIP, gzip, or tar.",
  SprintCompletedImmutable: () =>
    "Sprint is already completed and cannot be modified.",
  BranchNotFound: ({ name }) =>
    name
      ? `Branch not found on remote: ${name}.`
      : "Branch not found on remote.",
  GitHubTokenExpired: () => "GitHub token expired — reconnect GitHub.",
  GitHubScopeInsufficient: () => "GitHub token is missing required scopes.",
  RepoGone: () => "Connected GitHub repository is gone.",
  RateLimited: () => "Rate limited by GitHub — retry later.",
  GitHubError: ({ message }) =>
    message ? `GitHub error: ${message}.` : "GitHub error."
}

const backendMessages: Messages<BackendToolError> = {
  SchemaError: (error) => `Validation error: ${error.message}`,
  MarkdownError: () => "Document read failed.",
  BetterAuthError: () => "Auth provider error.",
  TicketIdTaken: () => "Identifier already taken.",
  GroupIdTaken: () => "Identifier already taken.",
  AttachmentNotUploaded: () =>
    "AttachmentNotUploaded: The uploaded object could not be verified. Retry the POST to uploadUrl. If the upload URL expired, prepare a new upload.",
  BranchExists: ({ branch }) =>
    branch ? `Branch already exists: ${branch}.` : "Branch already exists.",
  BranchProtected: () => "Branch is protected."
}

const messages: Partial<Record<string, (error: never) => string>> = {
  ...catalogMessages,
  ...backendMessages
}

export const mappedToolErrorText = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return undefined
  }
  return messages[String(error._tag)]?.(error as never)
}
