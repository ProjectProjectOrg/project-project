import * as Match from "effect/Match"

import type { ToolError } from "./Tools"

type Messages<E extends Readonly<{ _tag: string }>> = {
  readonly [K in E["_tag"]]: (
    error: Extract<E, Readonly<{ _tag: K }>>
  ) => string
}

const asSentence = (text: string): string => {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const editFailureMessage = (failure: string): string => {
  const [code, count] = failure.split(":")
  const markup = failure.match(/^block_markup:(.*)$/s)
  if (markup) {
    return `it leaves invalid block markup: ${asSentence(markup[1] ?? "")}`
  }
  switch (code) {
    case "no_match":
      return "oldText doesn't appear in the current description; read it again with get_ticket and copy the text exactly."
    case "multiple_matches":
      return `oldText appears ${count} times; include more surrounding text so it matches once, or set replaceAll.`
    case "block_not_found":
      return "the description has no block of that type; see blocks in get_ticket."
    case "block_ambiguous":
      return `the description has ${count} blocks of that type; use a replace edit on the exact text instead.`
    case "block_synced":
      return "that block is synced and managed centrally; only tick or untick its checkboxes with a replace edit."
    default:
      return `${failure}.`
  }
}

const messages: Messages<ToolError> = {
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
    const editFailed = reason?.match(/^edit_failed:(\d+):(.*)$/s)
    if (editFailed) {
      return `edits[${editFailed[1]}] failed: ${editFailureMessage(editFailed[2] ?? "")} Nothing was saved.`
    }
    if (reason === "edits_with_body_or_template") {
      return (
        "Pass edits on its own: it can't be combined with body or " +
        "template in one update_ticket call."
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

export const toolErrorText = Match.typeTags<ToolError>()(messages)
