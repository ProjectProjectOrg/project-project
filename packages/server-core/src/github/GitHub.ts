import type {
  BranchExists,
  BranchListResponse,
  BranchProtected,
  GitHubError,
  GithubRepoPage,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  RateLimited,
  RawProjectStates,
  RepoGone,
  VerifiedInstallationRepo
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type {
  GitHubInstallationAccount,
  VerifiedInstallationRepo,
  RawBranchEntry,
  RawMergedPullRequest,
  RawProjectStates,
  RawPullRequestText,
  ChecksStatus
} from "@pp/shared"

export class GitHub extends Context.Service<
  GitHub,
  Readonly<{
    listInstallationRepos: (
      installationId: string,
      query: string | undefined,
      page: number
    ) => Effect.Effect<GithubRepoPage, RepoGone | RateLimited | GitHubError>
    verifyInstallationRepo: (
      installationId: string,
      owner: string,
      name: string
    ) => Effect.Effect<
      VerifiedInstallationRepo,
      RepoGone | RateLimited | GitHubError
    >
    createBranchAsUser: (
      owner: string,
      name: string,
      branchName: string,
      baseBranch: string,
      userId: string
    ) => Effect.Effect<
      Readonly<{ name: string; sha: string }>,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | BranchExists
      | BranchProtected
      | RateLimited
      | GitHubError
    >
    openPullRequestAsUser: (
      owner: string,
      name: string,
      args: Readonly<{
        head: string
        base: string
        title: string
        body: string
        draft: boolean
      }>,
      userId: string
    ) => Effect.Effect<
      Readonly<{ number: number; url: string }>,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | BranchProtected
      | RateLimited
      | GitHubError
    >
    fetchInstallationProjectStates: (
      installationId: string,
      owner: string,
      name: string,
      branches: ReadonlyArray<string>,
      branchQuery?: string
    ) => Effect.Effect<RawProjectStates, RepoGone | RateLimited | GitHubError>
    listInstallationBranches: (
      installationId: string,
      owner: string,
      name: string,
      query: string | undefined,
      first: number,
      after: string | undefined
    ) => Effect.Effect<BranchListResponse, RepoGone | RateLimited | GitHubError>
    branchExistsInstallation: (
      installationId: string,
      owner: string,
      name: string,
      branch: string
    ) => Effect.Effect<boolean, RepoGone | RateLimited | GitHubError>
  }>
>()("@pp/server-core/github/GitHub") {}
