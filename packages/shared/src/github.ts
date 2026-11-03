import type { ChecksStatus } from "./schemas/GitState"

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
  mergedPrsByBranch: ReadonlyMap<string, ReadonlyArray<RawMergedPullRequest>>
  openPullRequestText: ReadonlyMap<string, RawPullRequestText>
  fetchedAt: Date
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
