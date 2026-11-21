import * as Match from "effect/Match"

import type { RelationInvalid } from "../errors"
import { formatBlockIssue } from "../tickets/blocks"
import { TicketBodyEditFailure } from "../tickets/bodyEdits"
import type { ToolError } from "./Tools"

type Messages<E extends Readonly<{ _tag: string }>> = {
  readonly [K in E["_tag"]]: (
    error: Extract<E, Readonly<{ _tag: K }>>
  ) => string
}

const asSentence = (text: string) => {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

const editFailureMessage = TicketBodyEditFailure.match({
  NoMatch: () =>
    "oldText doesn't appear in the current description; read it again with get_ticket and copy the text exactly.",
  MultipleMatches: ({ count }) =>
    `oldText appears ${count} times; include more surrounding text so it matches once, or set replaceAll.`,
  BlockNotFound: () =>
    "the description has no block of that type; see blocks in get_ticket.",
  BlockAmbiguous: ({ count }) =>
    `the description has ${count} blocks of that type; use a replace edit on the exact text instead.`,
  BlockSynced: () =>
    "that block is synced and managed centrally; only tick or untick its checkboxes with a replace edit.",
  BlockMarkup: ({ issue }) =>
    `it leaves invalid block markup: ${asSentence(formatBlockIssue(issue))}`
})

const RELATION_MESSAGES = {
  relation_self: ([ticket]) => `${ticket} can't be linked to itself.`,
  unknown_tickets: (ids) =>
    `No ticket ${ids.join(", ")} in this project; check the ids with list_tickets.`,
  blocking_cycle: (ids) =>
    `That would make a blocking loop (${ids.join(" → ")}). Remove one of those links first, or link the tickets as related instead.`,
  duplicate_of_duplicate: ([ticket, original]) =>
    `${ticket} is itself a duplicate of ${original}; mark this ticket a duplicate of ${original} instead.`,
  has_duplicates: (ids) =>
    `${ids.join(", ")} ${ids.length === 1 ? "is a duplicate" : "are duplicates"} of this ticket. Archive them as duplicates of the new original first.`
} satisfies Record<
  RelationInvalid["kind"],
  (ids: RelationInvalid["ids"]) => string
>

const messages: Messages<ToolError> = {
  Unauthorized: () => "Unauthorized.",
  Forbidden: () => "Forbidden.",
  NotFound: () => "Not found.",
  Validation: ({ reason }) =>
    reason === "edits_with_body"
      ? "Pass edits on its own: it can't be combined with body in one update_ticket call."
      : `Validation error (${reason}).`,
  UnknownType: ({ key }) =>
    `Unknown type "${key}". Discover the project's type keys via list_types, or pass null for no type.`,
  UnknownStatus: ({ status }) =>
    `Unknown status "${status}". Discover the project's statuses via list_statuses.`,
  UnknownTags: ({ tags }) =>
    `Unknown tags: ${tags.join(", ")}. Discover the project's tags via list_tags.`,
  NonMemberAssignees: ({ userIds }) =>
    `${userIds.join(", ")} ${userIds.length === 1 ? "isn't a member" : "aren't members"} of this project; discover members via list_members.`,
  EstimationOff: () =>
    "Estimation is off in this project, so tickets can't take an estimate.",
  EstimateUnitMismatch: ({ unit, estimation }) =>
    `The estimate is in ${unit} but this project estimates in ${estimation}.`,
  HierarchyInvalid: ({ kind }) => `Invalid ticket hierarchy (${kind}).`,
  RelationInvalid: ({ kind, ids }) => RELATION_MESSAGES[kind](ids),
  InvalidBlocks: (issue) =>
    `Invalid block markup: ${asSentence(formatBlockIssue(issue))} Discover ` +
    "valid block types via list_blocks, and see the create_ticket/" +
    "update_ticket descriptions for the format.",
  BodyEditFailed: ({ index, failure }) =>
    `edits[${index}] failed: ${editFailureMessage(failure)} Nothing was saved.`,
  TicketMoveRejected: ({ kind }) => `The ticket can't be moved (${kind}).`,
  SprintInvalid: ({ kind }) => `Invalid sprint (${kind}).`,
  TicketChanged: ({ kind }) =>
    `The ticket changed since you read it (${kind}); read it again and retry.`,
  TicketArchiveConflict: ({ kind }) =>
    kind === "already_archived"
      ? "The ticket is already archived."
      : "The ticket isn't archived.",
  BranchLinkConflict: ({ kind }) => `Branch link conflict (${kind}).`,
  GitHubConnectionConflict: ({ kind }) =>
    `GitHub connection conflict (${kind}).`,
  CommentBodyInvalid: ({ kind }) =>
    kind === "empty"
      ? "The comment is empty."
      : "The comment can't contain comment marker syntax (<!-- comment: -->).",
  CommentThreadResolved: () =>
    "That thread is resolved; reopen it before replying.",
  UploadFailed: ({ kind }) =>
    kind === "timed_out"
      ? "Upload timed out. Retry the upload URL, or prepare a new upload if it expired."
      : "Could not read upload body.",
  MentionInvalid: ({ kind, href }) => {
    const detail = kind && href ? `${kind}: ${href}` : (kind ?? href ?? "")
    return detail
      ? `Mention error (${detail}). Use [label](mention:user/<id>), [label](mention:ticket/<T-N>) or [T-N](mention:comment/<T-N>/<commentId>); discover ids via list_members, list_tickets and list_comments.`
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
  RepoGone: () => "A connected GitHub repository is gone.",
  RateLimited: () => "Rate limited by GitHub — retry later.",
  GitHubError: ({ message }) =>
    message ? `GitHub error: ${message}.` : "GitHub error."
}

export const toolErrorText = Match.typeTags<ToolError>()(messages)
