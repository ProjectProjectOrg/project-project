import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  Forbidden,
  type GitHubError,
  type GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  Validation,
  type CloseDisabledReason,
  type MergeDisabledReason,
  type MergeReviewInput,
  type PendingReviewCommentInput,
  type ReopenDisabledReason,
  type ReplyReviewCommentInput,
  type ReviewCheckRollup,
  type ReviewActor,
  type ReviewCapabilities,
  type ReviewComment,
  type ReviewCommentPosition,
  type ReviewCommentThread,
  type ReviewDisabledReason,
  type ReviewFilePatch,
  type ReviewFileStatus,
  type ReviewFileSummary,
  type ReviewLinkedTicket,
  type ReviewPage,
  type ReviewParticipant,
  type ReviewPr,
  type ReviewReviewer,
  type RateLimited,
  type SubmitReviewInput,
  type TicketDetail
} from "@projectproject/shared"
import { BetterAuth } from "../Services/BetterAuth"
import type {
  RawPendingReviewComment,
  RawReviewActor,
  RawReviewComment,
  RawReviewFile,
  RawReviewPullRequest,
  RawReviewThread
} from "../Services/GitHub"
import { GitHub } from "../Services/GitHub"
import { Projects, type ProjectGithubIntegration } from "../Services/Projects"
import {
  Reviews,
  type ReviewReadError,
  type ReviewsShape
} from "../Services/Reviews"
import { Tickets } from "../Services/Tickets"

const FILE_PAGE_SIZE = 30
type WriteAccess =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: "personal_github_required" | "insufficient_permission"
    }

interface ReviewContext {
  readonly integration: ProjectGithubIntegration
  readonly ticket: TicketDetail
}

const actorFromRaw = (actor: RawReviewActor): ReviewActor => ({
  login: actor.login,
  name: null,
  avatarUrl: actor.avatarUrl,
  url: actor.url
})

const checksFromTicket = (ticket: TicketDetail): ReviewCheckRollup | null => {
  if (
    ticket.gitState.tag !== "pr_open" ||
    ticket.gitState.number !== ticket.pr
  ) {
    return null
  }
  const status = ticket.gitState.checks
  return {
    status,
    totalCount: status === "none" ? 0 : 1,
    completedCount: status === "pending" || status === "none" ? 0 : 1
  }
}

const reviewPrFromRaw = (
  raw: RawReviewPullRequest,
  ticket: TicketDetail
): ReviewPr => ({
  number: raw.number,
  title: raw.title,
  body: raw.body,
  state: raw.state,
  draft: raw.draft,
  merged: raw.merged,
  mergeable: raw.mergeable,
  htmlUrl: raw.htmlUrl,
  repoOwner: raw.base.repoOwner,
  repoName: raw.base.repoName,
  author: actorFromRaw(raw.author),
  base: raw.base,
  head: raw.head,
  counts: raw.counts,
  checks: checksFromTicket(ticket) ?? raw.checks,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  closedAt: raw.closedAt,
  mergedAt: raw.mergedAt
})

const linkedTicketFromDetail = (ticket: TicketDetail): ReviewLinkedTicket => ({
  id: ticket.id,
  title: ticket.title,
  status: ticket.status,
  type: ticket.type,
  priority: ticket.priority,
  assignees: ticket.assignees,
  branch: ticket.branch,
  gitState: ticket.gitState
})

const fileStatusFromRaw = (status: string): ReviewFileStatus => {
  if (
    status === "added" ||
    status === "removed" ||
    status === "modified" ||
    status === "renamed" ||
    status === "copied" ||
    status === "changed" ||
    status === "unchanged"
  ) {
    return status
  }
  return "changed"
}

const positionFromRaw = (
  raw: Pick<RawReviewComment, "path" | "side" | "line" | "startLine">
): ReviewCommentPosition | null =>
  raw.line === null
    ? null
    : {
        path: raw.path,
        side: raw.side,
        line: raw.line,
        startLine: raw.startLine
      }

const commentFromRaw = (raw: RawReviewComment): ReviewComment => ({
  id: raw.id,
  databaseId: raw.databaseId,
  author: actorFromRaw(raw.author),
  body: raw.body,
  htmlUrl: raw.htmlUrl,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  position: positionFromRaw(raw)
})

const reviewerFromRaw = (
  raw: RawReviewPullRequest["reviewers"][number]
): ReviewReviewer => ({
  actor: actorFromRaw(raw.actor),
  requested: raw.requested,
  decision: raw.decision
})

const threadFromRaw = (raw: RawReviewThread): ReviewCommentThread | null => {
  const [first, ...replies] = raw.comments
  if (!first) return null
  const position =
    raw.line === null
      ? null
      : {
          path: raw.path,
          side: raw.side,
          line: raw.line,
          startLine: raw.startLine
        }
  return {
    id: raw.id,
    path: raw.path,
    position,
    resolved: raw.resolved,
    outdated: raw.outdated,
    canResolve: !raw.outdated,
    htmlUrl: first.htmlUrl,
    firstComment: commentFromRaw(first),
    replies: replies.map(commentFromRaw)
  }
}

const summaryFromRaw = (
  raw: RawReviewFile,
  threads: ReadonlyArray<RawReviewThread>,
  comments: ReadonlyArray<RawReviewComment>
): ReviewFileSummary => ({
  filename: raw.filename,
  previousFilename: raw.previousFilename,
  status: fileStatusFromRaw(raw.status),
  additions: raw.additions,
  deletions: raw.deletions,
  changes: raw.changes,
  threadCount: threads.filter((thread) => thread.path === raw.filename).length,
  commentCount: comments.filter((comment) => comment.path === raw.filename)
    .length,
  binary: raw.binary
})

const patchFromRaw = (
  raw: RawReviewFile,
  threads: ReadonlyArray<RawReviewThread>,
  comments: ReadonlyArray<RawReviewComment>
): ReviewFilePatch => ({
  summary: summaryFromRaw(raw, threads, comments),
  patch: raw.patch,
  tooLarge: raw.patch === null,
  htmlUrl: raw.htmlUrl
})

const participantKey = (actor: ReviewActor) => actor.login

const participantsFrom = (
  pr: RawReviewPullRequest,
  comments: ReadonlyArray<RawReviewComment>
): ReadonlyArray<ReviewParticipant> => {
  const participants = new Map<string, ReviewParticipant>()
  const add = (actor: ReviewActor, role: ReviewParticipant["role"]) => {
    if (!participants.has(participantKey(actor))) {
      participants.set(participantKey(actor), { actor, role })
    }
  }
  add(actorFromRaw(pr.author), "author")
  for (const reviewer of pr.reviewers) {
    add(actorFromRaw(reviewer.actor), "reviewer")
  }
  for (const comment of comments) add(actorFromRaw(comment.author), "commenter")
  return [...participants.values()]
}

const mentionCandidatesFrom = (
  participants: ReadonlyArray<ReviewParticipant>
): ReadonlyArray<ReviewActor> => participants.map((p) => p.actor)

const allThreadComments = (
  threads: ReadonlyArray<RawReviewThread>
): ReadonlyArray<RawReviewComment> =>
  threads.flatMap((thread) => thread.comments)

const disabledByPrState = (
  pr: RawReviewPullRequest,
  access: WriteAccess
): ReviewCapabilities => {
  const accessReviewReason: ReviewDisabledReason | null = access.ok
    ? null
    : access.reason
  const accessMergeReason: MergeDisabledReason | null = access.ok
    ? null
    : access.reason
  const accessCloseReason: CloseDisabledReason | null = access.ok
    ? null
    : access.reason
  const accessReopenReason: ReopenDisabledReason | null = access.ok
    ? null
    : access.reason

  const review =
    accessReviewReason ??
    (pr.state !== "open" ? ("pr_not_open" as const) : null)
  const merge =
    accessMergeReason ??
    (pr.state !== "open"
      ? ("pr_not_open" as const)
      : pr.draft
        ? ("draft_pr" as const)
        : pr.mergeable === false
          ? ("not_mergeable" as const)
          : null)
  const close =
    accessCloseReason ?? (pr.state !== "open" ? ("pr_not_open" as const) : null)
  const reopen =
    accessReopenReason ??
    (pr.merged
      ? ("pr_merged" as const)
      : pr.state !== "closed"
        ? ("pr_not_closed" as const)
        : null)

  return {
    canView: true,
    canReview: review === null,
    canMerge: merge === null,
    canClose: close === null,
    canReopen: reopen === null,
    disabledReasons: { review, merge, close, reopen }
  }
}

const parsePage = (cursor: string | undefined): number => {
  if (cursor === undefined) return 1
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const loadedCount = (
  page: number,
  perPage: number,
  currentCount: number,
  totalCount: number
) => Math.min((page - 1) * perPage + currentCount, totalCount)

const pendingCommentFromInput = (
  input: PendingReviewCommentInput
): RawPendingReviewComment => ({
  path: input.path,
  body: input.body,
  side: input.side,
  line: input.line,
  ...(input.startLine !== undefined ? { startLine: input.startLine } : {})
})

export const ReviewsLive = Layer.effect(
  Reviews,
  Effect.gen(function* () {
    const projects = yield* Projects
    const tickets = yield* Tickets
    const github = yield* GitHub
    const betterAuth = yield* BetterAuth

    const withTelemetry = <A, E>(
      operation: string,
      orgSlug: string,
      slug: string,
      prNumber: number,
      effect: Effect.Effect<A, E>
    ) =>
      effect.pipe(
        Effect.withSpan(`Reviews.${operation}`, {
          attributes: { module: "Reviews", operation, orgSlug, slug, prNumber }
        }),
        Effect.annotateLogs({ module: "Reviews", operation, orgSlug, slug })
      )

    const resolveContext = (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number
    ): Effect.Effect<ReviewContext, ReviewReadError> =>
      Effect.gen(function* () {
        const integration = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        if (integration === null) return yield* new NotFound()
        const first = yield* tickets
          .findByPrNumber(orgSlug, userId, slug, prNumber)
          .pipe(Effect.either)
        if (first._tag === "Right") return { integration, ticket: first.right }
        if (first.left._tag !== "NotFound") return yield* first.left
        yield* tickets.listGitStates(orgSlug, userId, slug)
        const ticket = yield* tickets.findByPrNumber(
          orgSlug,
          userId,
          slug,
          prNumber
        )
        return { integration, ticket }
      })

    const writeAccess = (
      userId: string,
      installationId: string
    ): Effect.Effect<WriteAccess, GitHubError | RateLimited> =>
      Effect.gen(function* () {
        void installationId
        const token = yield* betterAuth.getGithubAccessToken(userId).pipe(
          Effect.catchTag("NoGithubToken", () =>
            Effect.succeed(null as string | null)
          ),
          Effect.catchTag("BetterAuthError", (error) => Effect.die(error))
        )
        if (token === null) {
          return { ok: false, reason: "personal_github_required" as const }
        }
        return { ok: true as const }
      })

    const requireWriteAccess = (
      userId: string,
      installationId: string
    ): Effect.Effect<
      void,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | Forbidden
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const access = yield* writeAccess(userId, installationId)
        if (access.ok) return
        if (access.reason === "personal_github_required") {
          return yield* new GitHubTokenExpired()
        }
        return yield* new Forbidden()
      })

    const fetchPr = (ctx: ReviewContext, prNumber: number) =>
      github.fetchReviewPullRequestInstallation(
        ctx.integration.installationId,
        ctx.integration.repoOwner,
        ctx.integration.repoName,
        prNumber
      )

    const fetchComments = (ctx: ReviewContext, prNumber: number) =>
      github.fetchReviewCommentsInstallation(
        ctx.integration.installationId,
        ctx.integration.repoOwner,
        ctx.integration.repoName,
        prNumber
      )

    const fetchThreads = (ctx: ReviewContext, prNumber: number) =>
      github.fetchReviewThreadsInstallation(
        ctx.integration.installationId,
        ctx.integration.repoOwner,
        ctx.integration.repoName,
        prNumber
      )

    const fetchReviewDiscussion = (ctx: ReviewContext, prNumber: number) =>
      Effect.all(
        {
          comments: fetchComments(ctx, prNumber).pipe(
            Effect.map((response) => response.comments)
          ),
          threads: fetchThreads(ctx, prNumber)
        },
        { concurrency: 2 }
      )

    const get = Effect.fn("Reviews.get")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number
    ) {
      return yield* withTelemetry(
        "get",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          const pr = yield* fetchPr(ctx, prNumber)
          const access = yield* writeAccess(
            userId,
            ctx.integration.installationId
          )
          const participants = participantsFrom(pr, [])
          return {
            pr: reviewPrFromRaw(pr, ctx.ticket),
            linkedTicket: linkedTicketFromDetail(ctx.ticket),
            reviewers: pr.reviewers.map(reviewerFromRaw),
            participants,
            capabilities: disabledByPrState(pr, access),
            mergeMethods: pr.mergeMethods
          } satisfies ReviewPage
        })
      )
    })

    const fileSummaries = Effect.fn("Reviews.fileSummaries")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      cursor: string | undefined
    ) {
      return yield* withTelemetry(
        "fileSummaries",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          const page = parsePage(cursor)
          const [pr, files, discussion] = yield* Effect.all([
            fetchPr(ctx, prNumber),
            github.fetchReviewFilesInstallation(
              ctx.integration.installationId,
              ctx.integration.repoOwner,
              ctx.integration.repoName,
              prNumber,
              page,
              FILE_PAGE_SIZE
            ),
            fetchReviewDiscussion(ctx, prNumber)
          ])
          const comments = [
            ...discussion.comments,
            ...allThreadComments(discussion.threads)
          ]
          return {
            items: files.files.map((file) =>
              summaryFromRaw(file, discussion.threads, comments)
            ),
            nextCursor: files.hasMore ? String(page + 1) : null,
            totalCount: pr.counts.filesChanged,
            loadedCount: loadedCount(
              files.page,
              files.perPage,
              files.files.length,
              pr.counts.filesChanged
            )
          }
        })
      )
    })

    const files = Effect.fn("Reviews.files")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      cursor: string | undefined
    ) {
      return yield* withTelemetry(
        "files",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          const page = parsePage(cursor)
          const [pr, filePage, discussion] = yield* Effect.all([
            fetchPr(ctx, prNumber),
            github.fetchReviewFilesInstallation(
              ctx.integration.installationId,
              ctx.integration.repoOwner,
              ctx.integration.repoName,
              prNumber,
              page,
              FILE_PAGE_SIZE
            ),
            fetchReviewDiscussion(ctx, prNumber)
          ])
          const comments = [
            ...discussion.comments,
            ...allThreadComments(discussion.threads)
          ]
          return {
            files: filePage.files.map((file) =>
              patchFromRaw(file, discussion.threads, comments)
            ),
            nextCursor: filePage.hasMore ? String(page + 1) : null,
            totalCount: pr.counts.filesChanged,
            loadedCount: loadedCount(
              filePage.page,
              filePage.perPage,
              filePage.files.length,
              pr.counts.filesChanged
            )
          }
        })
      )
    })

    const comments = Effect.fn("Reviews.comments")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number
    ) {
      return yield* withTelemetry(
        "comments",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          const [pr, discussion] = yield* Effect.all([
            fetchPr(ctx, prNumber),
            fetchReviewDiscussion(ctx, prNumber)
          ])
          const threads = discussion.threads.flatMap((thread) => {
            const mapped = threadFromRaw(thread)
            return mapped ? [mapped] : []
          })
          const participants = participantsFrom(pr, [
            ...discussion.comments,
            ...allThreadComments(discussion.threads)
          ])
          return {
            threads,
            participants,
            mentionCandidates: mentionCandidatesFrom(participants)
          }
        })
      )
    })

    const submit = Effect.fn("Reviews.submit")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      input: SubmitReviewInput
    ) {
      return yield* withTelemetry(
        "submit",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          if (
            input.event === "comment" &&
            input.comments.length === 0 &&
            !input.body?.trim()
          ) {
            return yield* new Validation({ reason: "empty_review" })
          }
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          return yield* github.submitReviewAsUser(
            ctx.integration.repoOwner,
            ctx.integration.repoName,
            prNumber,
            {
              event: input.event,
              ...(input.body !== undefined ? { body: input.body } : {}),
              comments: input.comments.map(pendingCommentFromInput)
            },
            userId
          )
        })
      )
    })

    const findThreadAfterMutation = (
      ctx: ReviewContext,
      prNumber: number,
      predicate: (thread: ReviewCommentThread) => boolean
    ) =>
      Effect.gen(function* () {
        const raw = yield* fetchThreads(ctx, prNumber)
        const thread = raw
          .flatMap((item) => {
            const mapped = threadFromRaw(item)
            return mapped ? [mapped] : []
          })
          .find(predicate)
        return thread ?? (yield* new NotFound())
      })

    const reply = Effect.fn("Reviews.reply")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      commentId: string,
      input: ReplyReviewCommentInput
    ) {
      return yield* withTelemetry(
        "reply",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const numericCommentId = Number.parseInt(commentId, 10)
          if (!Number.isFinite(numericCommentId) || numericCommentId <= 0) {
            return yield* new Validation({ reason: "invalid_comment_id" })
          }
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const comment = yield* github.replyToReviewCommentAsUser(
            ctx.integration.repoOwner,
            ctx.integration.repoName,
            prNumber,
            numericCommentId,
            input.body,
            userId
          )
          const thread = yield* findThreadAfterMutation(ctx, prNumber, (item) =>
            [item.firstComment, ...item.replies].some(
              (c) => c.id === comment.id
            )
          )
          return { thread }
        })
      )
    })

    const resolveThread = Effect.fn("Reviews.resolveThread")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      threadId: string
    ) {
      return yield* withTelemetry(
        "resolveThread",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const mutation = yield* github.resolveReviewThreadAsUser(
            threadId,
            userId
          )
          const thread = yield* findThreadAfterMutation(
            ctx,
            prNumber,
            (item) => item.id === mutation.threadId
          )
          return { thread }
        })
      )
    })

    const unresolveThread = Effect.fn("Reviews.unresolveThread")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      threadId: string
    ) {
      return yield* withTelemetry(
        "unresolveThread",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const mutation = yield* github.unresolveReviewThreadAsUser(
            threadId,
            userId
          )
          const thread = yield* findThreadAfterMutation(
            ctx,
            prNumber,
            (item) => item.id === mutation.threadId
          )
          return { thread }
        })
      )
    })

    const merge = Effect.fn("Reviews.merge")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number,
      input: MergeReviewInput
    ) {
      return yield* withTelemetry(
        "merge",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const result = yield* github.mergePullRequestAsUser(
            ctx.integration.repoOwner,
            ctx.integration.repoName,
            prNumber,
            input,
            userId
          )
          yield* tickets.listGitStates(orgSlug, userId, slug)
          return result
        })
      )
    })

    const close = Effect.fn("Reviews.close")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number
    ) {
      return yield* withTelemetry(
        "close",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const pr = yield* github.closePullRequestAsUser(
            ctx.integration.repoOwner,
            ctx.integration.repoName,
            prNumber,
            userId
          )
          yield* tickets.listGitStates(orgSlug, userId, slug)
          return { pr: reviewPrFromRaw(pr, ctx.ticket) }
        })
      )
    })

    const reopen = Effect.fn("Reviews.reopen")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      prNumber: number
    ) {
      return yield* withTelemetry(
        "reopen",
        orgSlug,
        slug,
        prNumber,
        Effect.gen(function* () {
          const ctx = yield* resolveContext(orgSlug, userId, slug, prNumber)
          yield* requireWriteAccess(userId, ctx.integration.installationId)
          const pr = yield* github.reopenPullRequestAsUser(
            ctx.integration.repoOwner,
            ctx.integration.repoName,
            prNumber,
            userId
          )
          yield* tickets.listGitStates(orgSlug, userId, slug)
          return { pr: reviewPrFromRaw(pr, ctx.ticket) }
        })
      )
    })

    return {
      get,
      fileSummaries,
      files,
      comments,
      submit,
      reply,
      resolveThread,
      unresolveThread,
      merge,
      close,
      reopen
    } satisfies ReviewsShape
  })
)
