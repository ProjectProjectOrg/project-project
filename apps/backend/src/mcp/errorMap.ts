import { BetterAuthError } from "@pp/server-core/auth/BetterAuth"
import {
  GroupIdTaken,
  MarkdownError,
  TicketIdTaken
} from "@pp/server-core/markdown/Markdown"
import {
  McpTools,
  AttachmentNotUploaded,
  BranchExists,
  BranchProtected,
  type McpToolError
} from "@pp/shared"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"

const BackendToolError = Schema.Union([
  AttachmentNotUploaded,
  BetterAuthError,
  BranchExists,
  BranchProtected,
  Schema.instanceOf(GroupIdTaken),
  Schema.instanceOf(MarkdownError),
  Schema.instanceOf(Schema.SchemaError),
  Schema.instanceOf(TicketIdTaken)
])
type BackendToolError = typeof BackendToolError.Type
const isBackendError = Schema.is(BackendToolError)
const isCatalogError = Schema.is(
  Schema.Union(
    Object.values(McpTools).flatMap<
      (typeof McpTools)[keyof typeof McpTools]["errors"][number]
    >((spec) => spec.errors)
  )
)

type Messages<E extends { readonly _tag: string }> = {
  readonly [K in E["_tag"]]: (error: Extract<E, { readonly _tag: K }>) => string
}

const asSentence = (text: string): string => {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const catalogMessages: Messages<McpToolError> = {
  Unauthorized: () => "Unauthorized.",
  Forbidden: () => "Forbidden.",
  NotFound: () => "Not found.",
  Conflict: ({ reason }) => (reason ? `Conflict (${reason}).` : "Conflict."),
  Validation: ({ reason }) => {
    const blockMarkup = reason?.match(/^block_markup:(.*)$/s)
    if (blockMarkup) {
      return (
        `Invalid block markup: ${asSentence(blockMarkup[1] ?? "")} Discover ` +
        "valid block types via list_blocks, and see the create_ticket/" +
        "update_ticket descriptions for the format."
      )
    }
    const unknownTemplate = reason?.match(/^unknown_template:(.*)$/s)
    if (unknownTemplate) {
      return (
        `Unknown template "${unknownTemplate[1]}". Discover the project's ` +
        "template keys via list_templates, or omit template for a blank " +
        "ticket."
      )
    }
    const needsBody = reason?.match(/^template_needs_body:(.*)$/s)
    if (needsBody) {
      return (
        `Template "${needsBody[1]}" can only fill an empty or untouched ` +
        "description, and this ticket already has content. Read the " +
        "template's body from list_templates, fill it in around the " +
        "existing content, and pass it to update_ticket as body."
      )
    }
    return reason ? `Validation error (${reason}).` : "Validation error."
  },
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

const catalogMessage = Match.typeTags<McpToolError>()(catalogMessages)
const backendMessage = Match.typeTags<BackendToolError>()(backendMessages)

export const mappedToolErrorText = Match.type<unknown>().pipe(
  Match.when(isCatalogError, catalogMessage),
  Match.when(isBackendError, backendMessage),
  Match.orElse(() => undefined)
)
