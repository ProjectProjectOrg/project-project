import type { GitHubShape } from "@pp/shared"
import * as Context from "effect/Context"

export type {
  ChecksStatus,
  GitHubShape,
  GitHubInstallationAccount,
  VerifiedInstallationRepo,
  RawBranchEntry,
  RawMergedPullRequest,
  RawProjectStates,
  RawPullRequestText
} from "@pp/shared"

export class GitHub extends Context.Service<GitHub, GitHubShape>()(
  "@pp/integration-github/GitHub"
) {}
