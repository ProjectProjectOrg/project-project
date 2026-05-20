import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  BranchExists,
  BranchListResponse,
  BranchProtected,
  ChecksStatus,
  Conflict,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GithubRepoPage,
  RateLimited,
  RepoGone
} from "@projectproject/shared"

export interface RawBranchEntry {
  readonly headRefName: string
  readonly baseRefName: string
  readonly state: "open" | "closed" | "merged"
  readonly draft: boolean
  readonly number: number
  readonly url: string
  readonly title: string
  readonly mergedAt: Date | null
  readonly checks: "passing" | "failing" | "pending" | "neutral" | "none"
}

export interface RawProjectStates {
  readonly defaultBranch: string
  readonly existingBranches: ReadonlySet<string>
  readonly prByBranch: ReadonlyMap<string, RawBranchEntry>
}

export interface RawReviewActor {
  readonly login: string
  readonly avatarUrl: string | null
  readonly url: string | null
}

export interface RawReviewBranchRef {
  readonly label: string
  readonly ref: string
  readonly sha: string
  readonly repoOwner: string
  readonly repoName: string
}

export interface RawReviewPullRequest {
  readonly id: string
  readonly nodeId: string
  readonly number: number
  readonly title: string
  readonly body: string
  readonly state: "open" | "closed" | "merged"
  readonly draft: boolean
  readonly merged: boolean
  readonly mergeable: boolean | null
  readonly htmlUrl: string
  readonly author: RawReviewActor
  readonly base: RawReviewBranchRef
  readonly head: RawReviewBranchRef
  readonly counts: {
    readonly commits: number
    readonly filesChanged: number
    readonly additions: number
    readonly deletions: number
    readonly comments: number
    readonly reviewComments: number
  }
  readonly checks: {
    readonly status: ChecksStatus
    readonly totalCount: number
    readonly completedCount: number
  }
  readonly reviewers: ReadonlyArray<{
    readonly actor: RawReviewActor
    readonly requested: boolean
    readonly decision:
      | "approved"
      | "changes_requested"
      | "commented"
      | "pending"
      | "dismissed"
      | "none"
  }>
  readonly mergeMethods: {
    readonly allowed: ReadonlyArray<"merge" | "squash" | "rebase">
    readonly defaultMethod: "merge" | "squash" | "rebase" | null
  }
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly closedAt: Date | null
  readonly mergedAt: Date | null
}

export interface RawReviewFile {
  readonly filename: string
  readonly previousFilename: string | null
  readonly status: string
  readonly additions: number
  readonly deletions: number
  readonly changes: number
  readonly patch: string | null
  readonly htmlUrl: string
  readonly binary: boolean
}

export interface RawReviewFilePage {
  readonly files: ReadonlyArray<RawReviewFile>
  readonly page: number
  readonly perPage: number
  readonly hasMore: boolean
}

export interface RawReviewComment {
  readonly id: string
  readonly databaseId: number | null
  readonly author: RawReviewActor
  readonly body: string
  readonly htmlUrl: string
  readonly path: string
  readonly side: "left" | "right"
  readonly line: number | null
  readonly startLine: number | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface RawReviewThread {
  readonly id: string
  readonly path: string
  readonly resolved: boolean
  readonly outdated: boolean
  readonly side: "left" | "right"
  readonly line: number | null
  readonly startLine: number | null
  readonly comments: ReadonlyArray<RawReviewComment>
}

export interface RawReviewComments {
  readonly comments: ReadonlyArray<RawReviewComment>
  readonly threads: ReadonlyArray<RawReviewThread>
}

export interface RawPendingReviewComment {
  readonly path: string
  readonly body: string
  readonly side: "left" | "right"
  readonly line: number
  readonly startLine?: number
}

export interface RawSubmitReviewInput {
  readonly event: "comment" | "approve" | "request_changes"
  readonly body?: string
  readonly comments: ReadonlyArray<RawPendingReviewComment>
}

export interface RawSubmitReviewResult {
  readonly reviewId: string
  readonly htmlUrl: string
}

export interface RawReviewThreadMutationResult {
  readonly threadId: string
  readonly resolved: boolean
}

export interface RawMergeReviewInput {
  readonly method: "merge" | "squash" | "rebase"
  readonly commitTitle?: string
  readonly commitMessage?: string
}

export interface RawMergeReviewResult {
  readonly merged: boolean
  readonly sha: string | null
  readonly message: string
}

export interface GitHubInstallationAccount {
  readonly installationId: string
  readonly accountId: string
  readonly accountLogin: string
  readonly accountType: "User" | "Organization"
}

export interface VerifiedInstallationRepo {
  readonly repoId: string
  readonly owner: string
  readonly name: string
  readonly defaultBranch: string
}

export interface GitHubShape {
  readonly getInstallationAccount: (
    installationId: string
  ) => Effect.Effect<GitHubInstallationAccount, RepoGone | GitHubError>
  readonly listInstallationRepos: (
    installationId: string,
    query: string | undefined,
    page: number
  ) => Effect.Effect<GithubRepoPage, RepoGone | RateLimited | GitHubError>
  readonly verifyInstallationRepo: (
    installationId: string,
    owner: string,
    name: string
  ) => Effect.Effect<VerifiedInstallationRepo, RepoGone | GitHubError>
  readonly exchangeAppUserCode: (
    code: string
  ) => Effect.Effect<string, GitHubError>
  readonly appUserCanAccessInstallation: (
    userAccessToken: string,
    installationId: string
  ) => Effect.Effect<
    boolean,
    GitHubTokenExpired | GitHubScopeInsufficient | RateLimited | GitHubError
  >
  readonly createBranchAsUser: (
    owner: string,
    name: string,
    branchName: string,
    baseBranch: string,
    userId: string
  ) => Effect.Effect<
    { name: string; sha: string },
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | BranchExists
    | BranchProtected
    | RateLimited
    | GitHubError
  >
  readonly openPullRequestAsUser: (
    owner: string,
    name: string,
    args: {
      readonly head: string
      readonly base: string
      readonly title: string
      readonly body: string
      readonly draft: boolean
    },
    userId: string
  ) => Effect.Effect<
    { number: number; url: string },
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | BranchProtected
    | RateLimited
    | GitHubError
  >
  readonly fetchInstallationProjectStates: (
    installationId: string,
    owner: string,
    name: string,
    branches: ReadonlyArray<string>
  ) => Effect.Effect<RawProjectStates, RepoGone | RateLimited | GitHubError>
  readonly listInstallationBranches: (
    installationId: string,
    owner: string,
    name: string,
    query: string | undefined,
    first: number
  ) => Effect.Effect<BranchListResponse, RepoGone | RateLimited | GitHubError>
  readonly branchExistsInstallation: (
    installationId: string,
    owner: string,
    name: string,
    branch: string
  ) => Effect.Effect<boolean, RepoGone | RateLimited | GitHubError>
  readonly fetchReviewPullRequestInstallation: (
    installationId: string,
    owner: string,
    name: string,
    prNumber: number
  ) => Effect.Effect<RawReviewPullRequest, RepoGone | RateLimited | GitHubError>
  readonly fetchReviewFilesInstallation: (
    installationId: string,
    owner: string,
    name: string,
    prNumber: number,
    page: number,
    perPage: number
  ) => Effect.Effect<RawReviewFilePage, RepoGone | RateLimited | GitHubError>
  readonly fetchReviewCommentsInstallation: (
    installationId: string,
    owner: string,
    name: string,
    prNumber: number
  ) => Effect.Effect<RawReviewComments, RepoGone | RateLimited | GitHubError>
  readonly fetchReviewThreadsInstallation: (
    installationId: string,
    owner: string,
    name: string,
    prNumber: number
  ) => Effect.Effect<
    ReadonlyArray<RawReviewThread>,
    RepoGone | RateLimited | GitHubError
  >
  readonly submitReviewAsUser: (
    owner: string,
    name: string,
    prNumber: number,
    input: RawSubmitReviewInput,
    userId: string
  ) => Effect.Effect<
    RawSubmitReviewResult,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly replyToReviewCommentAsUser: (
    owner: string,
    name: string,
    prNumber: number,
    commentId: number,
    body: string,
    userId: string
  ) => Effect.Effect<
    RawReviewComment,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly resolveReviewThreadAsUser: (
    threadId: string,
    userId: string
  ) => Effect.Effect<
    RawReviewThreadMutationResult,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly unresolveReviewThreadAsUser: (
    threadId: string,
    userId: string
  ) => Effect.Effect<
    RawReviewThreadMutationResult,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly mergePullRequestAsUser: (
    owner: string,
    name: string,
    prNumber: number,
    input: RawMergeReviewInput,
    userId: string
  ) => Effect.Effect<
    RawMergeReviewResult,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
    | Conflict
  >
  readonly closePullRequestAsUser: (
    owner: string,
    name: string,
    prNumber: number,
    userId: string
  ) => Effect.Effect<
    RawReviewPullRequest,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly reopenPullRequestAsUser: (
    owner: string,
    name: string,
    prNumber: number,
    userId: string
  ) => Effect.Effect<
    RawReviewPullRequest,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
}

export class GitHub extends Context.Tag(
  "@projectproject/backend/Services/GitHub"
)<GitHub, GitHubShape>() {}
