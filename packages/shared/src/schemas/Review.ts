// Review schemas - ticket-linked PR review read surface.
//
// The backend returns raw unified patch text for @pierre/diffs plus normalized
// GitHub PR, file, and review-thread metadata.

import { Schema } from "effect"
import { Slug } from "./Project"
import { TicketId } from "./Ticket"

export const ReviewSide = Schema.Literal("LEFT", "RIGHT")
export type ReviewSide = typeof ReviewSide.Type

export const ReviewUser = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  url: Schema.String
})
export type ReviewUser = typeof ReviewUser.Type

export const ReviewFileStatus = Schema.Literal(
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged"
)
export type ReviewFileStatus = typeof ReviewFileStatus.Type

export const ReviewFileSummary = Schema.Struct({
  path: Schema.String,
  previousPath: Schema.NullOr(Schema.String),
  status: ReviewFileStatus,
  additions: Schema.Number,
  deletions: Schema.Number,
  changes: Schema.Number,
  patchAvailable: Schema.Boolean,
  blobUrl: Schema.NullOr(Schema.String),
  rawUrl: Schema.NullOr(Schema.String)
})
export type ReviewFileSummary = typeof ReviewFileSummary.Type

export const ReviewThreadComment = Schema.Struct({
  id: Schema.String,
  databaseId: Schema.NullOr(Schema.Number),
  body: Schema.String,
  author: Schema.NullOr(ReviewUser),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  url: Schema.String
})
export type ReviewThreadComment = typeof ReviewThreadComment.Type

export const ReviewThread = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  line: Schema.NullOr(Schema.Number),
  side: Schema.NullOr(ReviewSide),
  startLine: Schema.NullOr(Schema.Number),
  startSide: Schema.NullOr(ReviewSide),
  isResolved: Schema.Boolean,
  isOutdated: Schema.Boolean,
  comments: Schema.Array(ReviewThreadComment)
})
export type ReviewThread = typeof ReviewThread.Type

export const PullRequestReviewBundle = Schema.Struct({
  projectSlug: Slug,
  ticketId: TicketId,
  repoOwner: Schema.String,
  repoName: Schema.String,
  number: Schema.Number,
  nodeId: Schema.String,
  url: Schema.String,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.Literal("open", "closed", "merged"),
  draft: Schema.Boolean,
  author: Schema.NullOr(ReviewUser),
  baseBranch: Schema.String,
  headBranch: Schema.String,
  baseSha: Schema.String,
  headSha: Schema.String,
  mergeable: Schema.Literal("mergeable", "conflicting", "unknown"),
  additions: Schema.Number,
  deletions: Schema.Number,
  changedFiles: Schema.Number,
  patch: Schema.String,
  files: Schema.Array(ReviewFileSummary),
  threads: Schema.Array(ReviewThread),
  fetchedAt: Schema.Date
})
export type PullRequestReviewBundle = typeof PullRequestReviewBundle.Type
