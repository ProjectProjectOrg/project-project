import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { RepoGone } from "@projectproject/shared"
import type {
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  RateLimited
} from "@projectproject/shared"
import type {
  RawMergeReviewInput,
  RawPendingReviewComment,
  RawReviewComment,
  RawReviewComments,
  RawReviewFile,
  RawReviewFilePage,
  RawReviewPullRequest,
  RawReviewThread,
  RawReviewThreadMutationResult,
  RawSubmitReviewInput,
  RawSubmitReviewResult
} from "../../Services/GitHub"
import { graphqlFor, octokitFor } from "./clients"
import { narrow } from "./errors"
import { githubRequest } from "./request"

type GitHubReadError = RepoGone | RateLimited | GitHubError
type GitHubUserWriteError =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | RateLimited
  | GitHubError

type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"
type ReviewCommentSide = "LEFT" | "RIGHT"

export interface SubmitReviewPayload {
  readonly event: ReviewEvent
  readonly body?: string
  readonly comments: Array<{
    path: string
    body: string
    side: ReviewCommentSide
    line: number
    start_side?: ReviewCommentSide
    start_line?: number
  }>
}

export interface MergePullRequestPayload {
  readonly merge_method: "merge" | "squash" | "rebase"
  readonly commit_title?: string
  readonly commit_message?: string
}

const eventToGithub = (
  event: RawSubmitReviewInput["event"]
): ReviewEvent => {
  if (event === "approve") return "APPROVE"
  if (event === "request_changes") return "REQUEST_CHANGES"
  return "COMMENT"
}

const sideToGithub = (
  side: RawPendingReviewComment["side"]
): ReviewCommentSide => (side === "left" ? "LEFT" : "RIGHT")

export const buildSubmitReviewPayload = (
  input: RawSubmitReviewInput
): SubmitReviewPayload => ({
  event: eventToGithub(input.event),
  ...(input.body !== undefined ? { body: input.body } : {}),
  comments: input.comments.map((comment) => ({
    path: comment.path,
    body: comment.body,
    side: sideToGithub(comment.side),
    line: comment.line,
    ...(comment.startLine !== undefined
      ? {
          start_side: sideToGithub(comment.side),
          start_line: comment.startLine
        }
      : {})
  }))
})

export const buildMergePullRequestPayload = (
  input: RawMergeReviewInput
): MergePullRequestPayload => ({
  merge_method: input.method,
  ...(input.commitTitle !== undefined ? { commit_title: input.commitTitle } : {}),
  ...(input.commitMessage !== undefined
    ? { commit_message: input.commitMessage }
    : {})
})

export const buildClosePullRequestPayload = () => ({ state: "closed" as const })

export const buildReopenPullRequestPayload = () => ({ state: "open" as const })

export const buildResolveThreadVariables = (threadId: string) => ({ threadId })

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

const positiveNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null

const isoDate = (value: string): Date =>
  DateTime.toDate(DateTime.unsafeMake(value))

const actorFrom = (value: {
  readonly login?: string | null
  readonly avatar_url?: string | null
  readonly html_url?: string | null
} | null | undefined) => ({
  login: value?.login ?? "unknown",
  avatarUrl: value?.avatar_url ?? null,
  url: value?.html_url ?? null
})

const rawPullRequestFromRest = (data: {
  readonly id: number
  readonly node_id?: string
  readonly number: number
  readonly title: string
  readonly body?: string | null
  readonly state: string
  readonly draft?: boolean
  readonly merged?: boolean
  readonly mergeable?: boolean | null
  readonly html_url: string
  readonly user?: {
    readonly login?: string | null
    readonly avatar_url?: string | null
    readonly html_url?: string | null
  } | null
  readonly base: {
    readonly label: string
    readonly ref: string
    readonly sha: string
    readonly repo: {
      readonly owner: { readonly login: string }
      readonly name: string
    }
  }
  readonly head: {
    readonly label: string
    readonly ref: string
    readonly sha: string
    readonly repo?: {
      readonly owner?: { readonly login?: string | null } | null
      readonly name?: string | null
    } | null
  }
  readonly commits?: number
  readonly changed_files?: number
  readonly additions?: number
  readonly deletions?: number
  readonly comments?: number
  readonly review_comments?: number
  readonly created_at: string
  readonly updated_at: string
  readonly closed_at?: string | null
  readonly merged_at?: string | null
}): RawReviewPullRequest => ({
  id: String(data.id),
  nodeId: data.node_id ?? String(data.id),
  number: data.number,
  title: data.title,
  body: data.body ?? "",
  state: data.merged ? "merged" : data.state === "closed" ? "closed" : "open",
  draft: data.draft ?? false,
  merged: data.merged ?? false,
  mergeable: data.mergeable ?? null,
  htmlUrl: data.html_url,
  author: actorFrom(data.user),
  base: {
    label: data.base.label,
    ref: data.base.ref,
    sha: data.base.sha,
    repoOwner: data.base.repo.owner.login,
    repoName: data.base.repo.name
  },
  head: {
    label: data.head.label,
    ref: data.head.ref,
    sha: data.head.sha,
    repoOwner: data.head.repo?.owner?.login ?? "",
    repoName: data.head.repo?.name ?? ""
  },
  counts: {
    commits: data.commits ?? 0,
    filesChanged: data.changed_files ?? 0,
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    comments: data.comments ?? 0,
    reviewComments: data.review_comments ?? 0
  },
  createdAt: isoDate(data.created_at),
  updatedAt: isoDate(data.updated_at),
  closedAt: data.closed_at ? isoDate(data.closed_at) : null,
  mergedAt: data.merged_at ? isoDate(data.merged_at) : null
})

const rawFileFromRest = (file: {
  readonly filename: string
  readonly previous_filename?: string
  readonly status: string
  readonly additions: number
  readonly deletions: number
  readonly changes: number
  readonly patch?: string
  readonly blob_url?: string
}): RawReviewFile => ({
  filename: file.filename,
  previousFilename: file.previous_filename ?? null,
  status: file.status,
  additions: file.additions,
  deletions: file.deletions,
  changes: file.changes,
  patch: file.patch ?? null,
  htmlUrl: file.blob_url ?? "",
  binary: file.patch === undefined
})

const rawCommentFromRest = (comment: {
  readonly id: number
  readonly node_id?: string
  readonly user?: {
    readonly login?: string | null
    readonly avatar_url?: string | null
    readonly html_url?: string | null
  } | null
  readonly body: string
  readonly html_url: string
  readonly path: string
  readonly side?: string
  readonly line?: number | null
  readonly start_line?: number | null
  readonly created_at: string
  readonly updated_at: string
}): RawReviewComment => ({
  id: comment.node_id ?? String(comment.id),
  databaseId: comment.id,
  author: actorFrom(comment.user),
  body: comment.body,
  htmlUrl: comment.html_url,
  path: comment.path,
  side: comment.side === "LEFT" ? "left" : "right",
  line: comment.line ?? null,
  startLine: comment.start_line ?? null,
  createdAt: isoDate(comment.created_at),
  updatedAt: isoDate(comment.updated_at)
})

export const fetchReviewPullRequestWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  tokenSource: "user" | "installation"
): Effect.Effect<RawReviewPullRequest, GitHubReadError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource,
        operation: "fetchReviewPullRequest",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.rest.pulls.get({
          owner,
          repo: name,
          pull_number: prNumber,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    return rawPullRequestFromRest(response.data)
  })

export const fetchReviewFilesWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  page: number,
  perPage: number,
  tokenSource: "user" | "installation"
): Effect.Effect<RawReviewFilePage, GitHubReadError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource,
        operation: "fetchReviewFiles",
        repoOwner: owner,
        repoName: name,
        page
      },
      (signal) =>
        octokit.rest.pulls.listFiles({
          owner,
          repo: name,
          pull_number: prNumber,
          page,
          per_page: perPage,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    return {
      files: response.data.map(rawFileFromRest),
      page,
      perPage,
      hasMore: response.data.length === perPage
    }
  })

export const fetchReviewCommentsWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  tokenSource: "user" | "installation"
): Effect.Effect<RawReviewComments, GitHubReadError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const comments = yield* githubRequest(
      {
        tokenSource,
        operation: "fetchReviewComments",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.paginate(octokit.rest.pulls.listReviewComments, {
          owner,
          repo: name,
          pull_number: prNumber,
          per_page: 100,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    return {
      comments: comments.map(rawCommentFromRest),
      threads: []
    }
  })

const REVIEW_THREADS_QUERY = `
  query ProjectProjectReviewThreads($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            startLine
            diffSide
            comments(first: 50) {
              nodes {
                id
                databaseId
                body
                url
                path
                diffSide
                line
                startLine
                createdAt
                updatedAt
                author {
                  login
                  avatarUrl
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`

interface ReviewThreadsResponse {
  readonly repository?: {
    readonly pullRequest?: {
      readonly reviewThreads: {
        readonly nodes: ReadonlyArray<{
          readonly id: string
          readonly isResolved: boolean
          readonly isOutdated: boolean
          readonly path: string
          readonly line?: number | null
          readonly startLine?: number | null
          readonly diffSide?: string | null
          readonly comments: {
            readonly nodes: ReadonlyArray<{
              readonly id: string
              readonly databaseId?: number | null
              readonly body: string
              readonly url: string
              readonly path: string
              readonly diffSide?: string | null
              readonly line?: number | null
              readonly startLine?: number | null
              readonly createdAt: string
              readonly updatedAt: string
              readonly author?: {
                readonly login?: string | null
                readonly avatarUrl?: string | null
                readonly url?: string | null
              } | null
            }>
          }
        }>
      }
    } | null
  } | null
}

type GraphqlReviewThread = NonNullable<
  NonNullable<
    NonNullable<ReviewThreadsResponse["repository"]>["pullRequest"]
  >["reviewThreads"]["nodes"][number]
>

type GraphqlReviewThreadComment =
  GraphqlReviewThread["comments"]["nodes"][number]

const rawCommentFromGraphql = (
  comment: GraphqlReviewThreadComment
): RawReviewComment => ({
  id: comment.id,
  databaseId: positiveNumber(comment.databaseId) ?? null,
  author: {
    login: comment.author?.login ?? "unknown",
    avatarUrl: comment.author?.avatarUrl ?? null,
    url: comment.author?.url ?? null
  },
  body: comment.body,
  htmlUrl: comment.url,
  path: comment.path,
  side: comment.diffSide === "LEFT" ? "left" : "right",
  line: positiveNumber(comment.line),
  startLine: positiveNumber(comment.startLine),
  createdAt: isoDate(comment.createdAt),
  updatedAt: isoDate(comment.updatedAt)
})

export const fetchReviewThreadsWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  tokenSource: "user" | "installation"
): Effect.Effect<ReadonlyArray<RawReviewThread>, GitHubReadError> =>
  Effect.gen(function* () {
    const gql = graphqlFor(token)
    const data = yield* githubRequest(
      {
        tokenSource,
        operation: "fetchReviewThreads",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        gql<ReviewThreadsResponse>(REVIEW_THREADS_QUERY, {
          owner,
          name,
          number: prNumber,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    const threads = data.repository?.pullRequest?.reviewThreads.nodes
    if (!threads) return yield* new RepoGone()
    return threads.map((thread) => {
      const comments = thread.comments.nodes.map(rawCommentFromGraphql)
      return {
        id: thread.id,
        path: thread.path,
        resolved: thread.isResolved,
        outdated: thread.isOutdated,
        side: thread.diffSide === "LEFT" ? "left" : "right",
        line: positiveNumber(thread.line),
        startLine: positiveNumber(thread.startLine),
        comments
      } satisfies RawReviewThread
    })
  })

export const submitReviewWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  input: RawSubmitReviewInput
): Effect.Effect<RawSubmitReviewResult, GitHubUserWriteError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource: "user",
        operation: "submitReview",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.rest.pulls.createReview({
          owner,
          repo: name,
          pull_number: prNumber,
          ...buildSubmitReviewPayload(input),
          request: { signal }
        }),
      narrow([
        "GitHubTokenExpired",
        "GitHubScopeInsufficient",
        "RepoGone",
        "RateLimited"
      ] as const)
    )
    return {
      reviewId: response.data.node_id ?? String(response.data.id),
      htmlUrl: response.data.html_url ?? ""
    }
  })

export const replyToReviewCommentWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  commentId: number,
  body: string
): Effect.Effect<RawReviewComment, GitHubUserWriteError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource: "user",
        operation: "replyToReviewComment",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo: name,
          pull_number: prNumber,
          comment_id: commentId,
          body,
          request: { signal }
        }),
      narrow([
        "GitHubTokenExpired",
        "GitHubScopeInsufficient",
        "RepoGone",
        "RateLimited"
      ] as const)
    )
    return rawCommentFromRest(response.data)
  })

const RESOLVE_THREAD_MUTATION = `
  mutation ProjectProjectResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`

const UNRESOLVE_THREAD_MUTATION = `
  mutation ProjectProjectUnresolveThread($threadId: ID!) {
    unresolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`

export const setReviewThreadResolvedWithToken = (
  token: string,
  threadId: string,
  resolved: boolean
): Effect.Effect<RawReviewThreadMutationResult, GitHubUserWriteError> =>
  Effect.gen(function* () {
    const gql = graphqlFor(token)
    yield* githubRequest(
      {
        tokenSource: "user",
        operation: resolved ? "resolveReviewThread" : "unresolveReviewThread"
      },
      (signal) =>
        gql(
          resolved ? RESOLVE_THREAD_MUTATION : UNRESOLVE_THREAD_MUTATION,
          {
            ...buildResolveThreadVariables(threadId),
            request: { signal }
          }
        ),
      narrow([
        "GitHubTokenExpired",
        "GitHubScopeInsufficient",
        "RepoGone",
        "RateLimited"
      ] as const)
    )
    return { threadId, resolved }
  })

export const mergePullRequestWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  input: RawMergeReviewInput
): Effect.Effect<
  { readonly merged: boolean; readonly sha: string | null; readonly message: string },
  GitHubUserWriteError
> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource: "user",
        operation: "mergePullRequest",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.rest.pulls.merge({
          owner,
          repo: name,
          pull_number: prNumber,
          ...buildMergePullRequestPayload(input),
          request: { signal }
        }),
      narrow([
        "GitHubTokenExpired",
        "GitHubScopeInsufficient",
        "RepoGone",
        "RateLimited"
      ] as const)
    )
    return {
      merged: response.data.merged,
      sha: nonEmptyString(response.data.sha),
      message: response.data.message
    }
  })

export const closePullRequestWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number
): Effect.Effect<RawReviewPullRequest, GitHubUserWriteError> =>
  updatePullRequestStateWithToken(
    token,
    owner,
    name,
    prNumber,
    buildClosePullRequestPayload()
  )

export const reopenPullRequestWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number
): Effect.Effect<RawReviewPullRequest, GitHubUserWriteError> =>
  updatePullRequestStateWithToken(
    token,
    owner,
    name,
    prNumber,
    buildReopenPullRequestPayload()
  )

const updatePullRequestStateWithToken = (
  token: string,
  owner: string,
  name: string,
  prNumber: number,
  payload: ReturnType<
    typeof buildClosePullRequestPayload | typeof buildReopenPullRequestPayload
  >
): Effect.Effect<RawReviewPullRequest, GitHubUserWriteError> =>
  Effect.gen(function* () {
    const octokit = octokitFor(token)
    const response = yield* githubRequest(
      {
        tokenSource: "user",
        operation: "updatePullRequestState",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        octokit.rest.pulls.update({
          owner,
          repo: name,
          pull_number: prNumber,
          ...payload,
          request: { signal }
        }),
      narrow([
        "GitHubTokenExpired",
        "GitHubScopeInsufficient",
        "RepoGone",
        "RateLimited"
      ] as const)
    )
    return rawPullRequestFromRest(response.data)
  })
