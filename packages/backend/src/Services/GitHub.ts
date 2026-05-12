import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  BranchExists,
  BranchListResponse,
  BranchProtected,
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

export interface GitHubShape {
  readonly listUserRepos: (
    userId: string,
    query: string | undefined,
    page: number
  ) => Effect.Effect<
    GithubRepoPage,
    GitHubTokenExpired | GitHubScopeInsufficient | GitHubError
  >
  readonly verifyAccess: (
    owner: string,
    name: string,
    userId: string
  ) => Effect.Effect<
    { defaultBranch: string },
    GitHubTokenExpired | GitHubScopeInsufficient | RepoGone | GitHubError
  >
  readonly createBranch: (
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
  readonly openPullRequest: (
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
  readonly fetchProjectStates: (
    owner: string,
    name: string,
    userId: string
  ) => Effect.Effect<
    RawProjectStates,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly listBranches: (
    owner: string,
    name: string,
    query: string | undefined,
    first: number,
    userId: string
  ) => Effect.Effect<
    BranchListResponse,
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
  >
  readonly branchExists: (
    owner: string,
    name: string,
    branch: string,
    userId: string
  ) => Effect.Effect<
    boolean,
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
