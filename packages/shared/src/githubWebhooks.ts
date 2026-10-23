import type { ChecksStatus } from "./schemas/GitState"

export type GitHubPullRequestWebhookChange = Readonly<{
  installationId: string
  repositoryId: string
  branch: string
  number: number
  title: string
  body: string
  state: "open" | "closed" | "merged"
  draft: boolean
  updatedAt: Date | null
  mergedAt?: Date | null
  baseBranch: string
  defaultBranch: string | null
  landed?: boolean
}>

export type GitHubRepositoryMetadataChange = Readonly<{
  installationId: string
  repoId: string
  owner: string
  name: string
  defaultBranch: string
}>

export type GitHubBranchDeletionChange = Readonly<{
  installationId: string
  repositoryId: string
  branch: string
}>

export type GitHubCheckWebhookChange = Readonly<{
  installationId: string
  repositoryId: string
  branch: string
  headSha: string
  checks: ChecksStatus
  updatedAt: Date
}>
