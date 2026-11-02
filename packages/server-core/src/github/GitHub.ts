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

export class GitHub extends Context.Service<
  GitHub,
  Pick<
    GitHubClientShape,
    | "listInstallationRepos"
    | "verifyInstallationRepo"
    | "createBranchAsUser"
    | "openPullRequestAsUser"
    | "fetchInstallationProjectStates"
    | "listInstallationBranches"
    | "branchExistsInstallation"
  >
>()("@pp/server-core/github/GitHub") {}
