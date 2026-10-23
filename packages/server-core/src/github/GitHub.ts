import type { GitHubShape as GitHubClientShape } from "@pp/shared"
import * as Context from "effect/Context"

export type {
  GitHubInstallationAccount,
  VerifiedInstallationRepo,
  RawBranchEntry,
  RawMergedPullRequest,
  RawProjectStates,
  RawPullRequestText,
  ChecksStatus
} from "@pp/shared"

export type GitHubShape = Pick<
  GitHubClientShape,
  | "listInstallationRepos"
  | "verifyInstallationRepo"
  | "createBranchAsUser"
  | "openPullRequestAsUser"
  | "fetchInstallationProjectStates"
  | "listInstallationBranches"
  | "branchExistsInstallation"
>

export class GitHub extends Context.Service<GitHub, GitHubShape>()(
  "@pp/server-core/github/GitHub"
) {}
