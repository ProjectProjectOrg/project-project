import type { GitHubShape } from "@pp/shared"
import * as Context from "effect/Context"

export type {
  GitHubShape,
  GitHubInstallationAccount,
  VerifiedInstallationRepo,
  RawBranchEntry,
  RawMergedPullRequest,
  RawProjectStates,
  RawPullRequestText,
  ChecksStatus
} from "@pp/shared"

export class GitHub extends Context.Service<GitHub, GitHubShape>()(
  "@pp/server-core/github/GitHub"
) {}
