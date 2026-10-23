import type * as Effect from "effect/Effect"

import type {
  BranchExists,
  BranchProtected,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  RateLimited,
  RepoGone
} from "./errors"
import type { ChecksStatus, BranchListResponse } from "./schemas/GitState"
import type { GithubRepoPage } from "./schemas/Project"

export type RawBranchEntry = Readonly<{
  headRefName: string
  baseRefName: string
  state: "open" | "closed" | "merged"
  draft: boolean
  number: number
  url: string
  title: string
  mergedAt: Date | null
  checks: ChecksStatus
}>

export type RawPullRequestText = Readonly<{
  title: string
  body: string
}>

export type RawMergedPullRequest = RawBranchEntry &
  Readonly<{ state: "merged" }>

export type RawProjectStates = Readonly<{
  defaultBranch: string
  existingBranches: ReadonlySet<string>
  prByBranch: ReadonlyMap<string, RawBranchEntry>
  mergedPrsByBranch?: ReadonlyMap<string, ReadonlyArray<RawMergedPullRequest>>
  openPullRequestText?: ReadonlyMap<string, RawPullRequestText>
  fetchedAt?: Date
  refreshStatus?: "stale" | "rate_limited"
  retryAt?: number
}>

export type GitHubInstallationAccount = Readonly<{
  installationId: string
  accountId: string
  accountLogin: string
  accountType: "User" | "Organization"
}>

export type VerifiedInstallationRepo = Readonly<{
  repoId: string
  owner: string
  name: string
  defaultBranch: string
}>

export type GitHubShape = Readonly<{
  getInstallationAccount: (
    installationId: string
  ) => Effect.Effect<
    GitHubInstallationAccount,
    RepoGone | RateLimited | GitHubError
  >
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
  exchangeAppUserCode: (code: string) => Effect.Effect<string, GitHubError>
  appUserCanAccessInstallation: (
    userAccessToken: string,
    installationId: string
  ) => Effect.Effect<boolean, RateLimited | GitHubError>
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
    first: number
  ) => Effect.Effect<BranchListResponse, RepoGone | RateLimited | GitHubError>
  branchExistsInstallation: (
    installationId: string,
    owner: string,
    name: string,
    branch: string
  ) => Effect.Effect<boolean, RepoGone | RateLimited | GitHubError>
}>
