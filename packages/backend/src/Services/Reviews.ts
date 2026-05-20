import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  MergeReviewInput,
  MergeReviewResult,
  NotFound,
  RateLimited,
  ReplyReviewCommentInput,
  RepoGone,
  ReviewCommentsResponse,
  ReviewFilePatchPage,
  ReviewFileSummaryPage,
  ReviewPage,
  ReviewPrMutationResult,
  ReviewThreadMutationResult,
  SubmitReviewInput,
  SubmitReviewResult,
  Validation
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

export type ReviewReadError =
  | NotFound
  | Forbidden
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | RateLimited
  | GitHubError
  | MarkdownError
  | MalformedTicketDocument

export type ReviewWriteError = ReviewReadError | Conflict | Validation

export type ReviewSubmitError = ReviewReadError | Validation
export type ReviewThreadWriteError = ReviewReadError | Validation
export type ReviewPrWriteError = ReviewReadError

export interface ReviewsShape {
  readonly get: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number
  ) => Effect.Effect<ReviewPage, ReviewReadError>
  readonly fileSummaries: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    cursor: string | undefined
  ) => Effect.Effect<ReviewFileSummaryPage, ReviewReadError>
  readonly files: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    cursor: string | undefined
  ) => Effect.Effect<ReviewFilePatchPage, ReviewReadError>
  readonly comments: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number
  ) => Effect.Effect<ReviewCommentsResponse, ReviewReadError>
  readonly submit: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    input: SubmitReviewInput
  ) => Effect.Effect<SubmitReviewResult, ReviewSubmitError>
  readonly reply: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    commentId: string,
    input: ReplyReviewCommentInput
  ) => Effect.Effect<ReviewThreadMutationResult, ReviewThreadWriteError>
  readonly resolveThread: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    threadId: string
  ) => Effect.Effect<ReviewThreadMutationResult, ReviewReadError>
  readonly unresolveThread: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    threadId: string
  ) => Effect.Effect<ReviewThreadMutationResult, ReviewReadError>
  readonly merge: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number,
    input: MergeReviewInput
  ) => Effect.Effect<MergeReviewResult, ReviewWriteError>
  readonly close: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number
  ) => Effect.Effect<ReviewPrMutationResult, ReviewPrWriteError>
  readonly reopen: (
    orgSlug: string,
    userId: string,
    slug: string,
    prNumber: number
  ) => Effect.Effect<ReviewPrMutationResult, ReviewPrWriteError>
}

export class Reviews extends Context.Tag(
  "@projectproject/backend/Services/Reviews"
)<Reviews, ReviewsShape>() {}
