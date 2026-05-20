import * as Schema from "effect/Schema"
import { TicketId, TicketPriority, TicketStatus, TicketType } from "./Ticket"

export const ReviewPositiveInt = Schema.Number.pipe(
  Schema.int(),
  Schema.positive()
)
export type ReviewPositiveInt = typeof ReviewPositiveInt.Type

export const ReviewNonNegativeInt = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative()
)
export type ReviewNonNegativeInt = typeof ReviewNonNegativeInt.Type

export const ReviewActor = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String)
})
export type ReviewActor = typeof ReviewActor.Type

export const ReviewBranchRef = Schema.Struct({
  label: Schema.String,
  ref: Schema.String,
  sha: Schema.String,
  repoOwner: Schema.String,
  repoName: Schema.String
})
export type ReviewBranchRef = typeof ReviewBranchRef.Type

export const ReviewPrState = Schema.Literal("open", "closed", "merged")
export type ReviewPrState = typeof ReviewPrState.Type

export const ReviewPrCounts = Schema.Struct({
  commits: ReviewNonNegativeInt,
  filesChanged: ReviewNonNegativeInt,
  additions: ReviewNonNegativeInt,
  deletions: ReviewNonNegativeInt,
  comments: ReviewNonNegativeInt,
  reviewComments: ReviewNonNegativeInt
})
export type ReviewPrCounts = typeof ReviewPrCounts.Type

export const ReviewCheckRollup = Schema.Struct({
  status: Schema.Literal("passing", "failing", "pending", "neutral", "none"),
  totalCount: ReviewNonNegativeInt,
  completedCount: ReviewNonNegativeInt
})
export type ReviewCheckRollup = typeof ReviewCheckRollup.Type

export const ReviewPr = Schema.Struct({
  number: ReviewPositiveInt,
  title: Schema.String,
  body: Schema.String,
  state: ReviewPrState,
  draft: Schema.Boolean,
  merged: Schema.Boolean,
  mergeable: Schema.NullOr(Schema.Boolean),
  htmlUrl: Schema.String,
  repoOwner: Schema.String,
  repoName: Schema.String,
  author: ReviewActor,
  base: ReviewBranchRef,
  head: ReviewBranchRef,
  counts: ReviewPrCounts,
  checks: ReviewCheckRollup,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  closedAt: Schema.NullOr(Schema.Date),
  mergedAt: Schema.NullOr(Schema.Date)
})
export type ReviewPr = typeof ReviewPr.Type

export const ReviewLinkedTicket = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  priority: TicketPriority,
  assignees: Schema.Array(Schema.String),
  branch: Schema.NullOr(Schema.String)
})
export type ReviewLinkedTicket = typeof ReviewLinkedTicket.Type

export const ReviewParticipant = Schema.Struct({
  actor: ReviewActor,
  role: Schema.Literal("author", "reviewer", "commenter", "committer")
})
export type ReviewParticipant = typeof ReviewParticipant.Type

export const ReviewDecision = Schema.Literal(
  "approved",
  "changes_requested",
  "commented",
  "pending",
  "dismissed",
  "none"
)
export type ReviewDecision = typeof ReviewDecision.Type

export const ReviewReviewer = Schema.Struct({
  actor: ReviewActor,
  requested: Schema.Boolean,
  decision: ReviewDecision
})
export type ReviewReviewer = typeof ReviewReviewer.Type

export const ReviewMergeMethod = Schema.Literal("merge", "squash", "rebase")
export type ReviewMergeMethod = typeof ReviewMergeMethod.Type

export const ReviewDisabledReason = Schema.Literal(
  "personal_github_required",
  "insufficient_permission",
  "pr_not_open"
)
export type ReviewDisabledReason = typeof ReviewDisabledReason.Type

export const MergeDisabledReason = Schema.Literal(
  "personal_github_required",
  "insufficient_permission",
  "draft_pr",
  "not_mergeable",
  "pr_not_open"
)
export type MergeDisabledReason = typeof MergeDisabledReason.Type

export const CloseDisabledReason = Schema.Literal(
  "personal_github_required",
  "insufficient_permission",
  "pr_not_open"
)
export type CloseDisabledReason = typeof CloseDisabledReason.Type

export const ReopenDisabledReason = Schema.Literal(
  "personal_github_required",
  "insufficient_permission",
  "pr_not_closed",
  "pr_merged"
)
export type ReopenDisabledReason = typeof ReopenDisabledReason.Type

export const ReviewCapabilities = Schema.Struct({
  canView: Schema.Boolean,
  canReview: Schema.Boolean,
  canMerge: Schema.Boolean,
  canClose: Schema.Boolean,
  canReopen: Schema.Boolean,
  disabledReasons: Schema.Struct({
    review: Schema.NullOr(ReviewDisabledReason),
    merge: Schema.NullOr(MergeDisabledReason),
    close: Schema.NullOr(CloseDisabledReason),
    reopen: Schema.NullOr(ReopenDisabledReason)
  })
})
export type ReviewCapabilities = typeof ReviewCapabilities.Type

export const ReviewPage = Schema.Struct({
  pr: ReviewPr,
  linkedTicket: ReviewLinkedTicket,
  reviewers: Schema.Array(ReviewReviewer),
  participants: Schema.Array(ReviewParticipant),
  capabilities: ReviewCapabilities,
  mergeMethods: Schema.Struct({
    allowed: Schema.Array(ReviewMergeMethod),
    defaultMethod: Schema.NullOr(ReviewMergeMethod)
  })
})
export type ReviewPage = typeof ReviewPage.Type

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
  filename: Schema.String,
  previousFilename: Schema.NullOr(Schema.String),
  status: ReviewFileStatus,
  additions: ReviewNonNegativeInt,
  deletions: ReviewNonNegativeInt,
  changes: ReviewNonNegativeInt,
  threadCount: ReviewNonNegativeInt,
  commentCount: ReviewNonNegativeInt,
  binary: Schema.Boolean
})
export type ReviewFileSummary = typeof ReviewFileSummary.Type

export const ReviewFileSummaryPage = Schema.Struct({
  items: Schema.Array(ReviewFileSummary),
  nextCursor: Schema.NullOr(Schema.String),
  totalCount: ReviewNonNegativeInt,
  loadedCount: ReviewNonNegativeInt
})
export type ReviewFileSummaryPage = typeof ReviewFileSummaryPage.Type

export const ReviewFilePatch = Schema.Struct({
  summary: ReviewFileSummary,
  patch: Schema.NullOr(Schema.String),
  tooLarge: Schema.Boolean,
  htmlUrl: Schema.String
})
export type ReviewFilePatch = typeof ReviewFilePatch.Type

export const ReviewFilePatchPage = Schema.Struct({
  files: Schema.Array(ReviewFilePatch),
  nextCursor: Schema.NullOr(Schema.String),
  totalCount: ReviewNonNegativeInt,
  loadedCount: ReviewNonNegativeInt
})
export type ReviewFilePatchPage = typeof ReviewFilePatchPage.Type

export const ReviewCommentSide = Schema.Literal("left", "right")
export type ReviewCommentSide = typeof ReviewCommentSide.Type

export const ReviewCommentPosition = Schema.Struct({
  path: Schema.String,
  side: ReviewCommentSide,
  line: ReviewPositiveInt,
  startLine: Schema.NullOr(ReviewPositiveInt)
})
export type ReviewCommentPosition = typeof ReviewCommentPosition.Type

export const ReviewComment = Schema.Struct({
  id: Schema.String,
  databaseId: Schema.NullOr(ReviewPositiveInt),
  author: ReviewActor,
  body: Schema.String,
  htmlUrl: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  position: Schema.NullOr(ReviewCommentPosition)
})
export type ReviewComment = typeof ReviewComment.Type

export const ReviewCommentThread = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  position: Schema.NullOr(ReviewCommentPosition),
  resolved: Schema.Boolean,
  outdated: Schema.Boolean,
  canResolve: Schema.Boolean,
  htmlUrl: Schema.NullOr(Schema.String),
  firstComment: ReviewComment,
  replies: Schema.Array(ReviewComment)
})
export type ReviewCommentThread = typeof ReviewCommentThread.Type

export const ReviewCommentsResponse = Schema.Struct({
  threads: Schema.Array(ReviewCommentThread),
  participants: Schema.Array(ReviewParticipant),
  mentionCandidates: Schema.Array(ReviewActor)
})
export type ReviewCommentsResponse = typeof ReviewCommentsResponse.Type

export const PendingReviewCommentInput = Schema.Struct({
  path: Schema.String,
  body: Schema.String.pipe(Schema.minLength(1)),
  side: ReviewCommentSide,
  line: ReviewPositiveInt,
  startLine: Schema.optional(ReviewPositiveInt)
})
export type PendingReviewCommentInput = typeof PendingReviewCommentInput.Type

export const SubmitReviewInput = Schema.Struct({
  event: Schema.Literal("comment", "approve", "request_changes"),
  body: Schema.optional(Schema.String),
  comments: Schema.Array(PendingReviewCommentInput)
})
export type SubmitReviewInput = typeof SubmitReviewInput.Type

export const SubmitReviewResult = Schema.Struct({
  reviewId: Schema.String,
  htmlUrl: Schema.String
})
export type SubmitReviewResult = typeof SubmitReviewResult.Type

export const ReplyReviewCommentInput = Schema.Struct({
  body: Schema.String.pipe(Schema.minLength(1))
})
export type ReplyReviewCommentInput = typeof ReplyReviewCommentInput.Type

export const ReviewThreadMutationResult = Schema.Struct({
  thread: ReviewCommentThread
})
export type ReviewThreadMutationResult = typeof ReviewThreadMutationResult.Type

export const MergeReviewInput = Schema.Struct({
  method: ReviewMergeMethod,
  commitTitle: Schema.optional(Schema.String),
  commitMessage: Schema.optional(Schema.String)
})
export type MergeReviewInput = typeof MergeReviewInput.Type

export const MergeReviewResult = Schema.Struct({
  merged: Schema.Boolean,
  sha: Schema.NullOr(Schema.String),
  message: Schema.String
})
export type MergeReviewResult = typeof MergeReviewResult.Type

export const ReviewPrMutationResult = Schema.Struct({
  pr: ReviewPr
})
export type ReviewPrMutationResult = typeof ReviewPrMutationResult.Type
