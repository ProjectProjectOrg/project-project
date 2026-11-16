import type { PullRequestState } from "../tickets/Ticket"
import type { GitState } from "./GitState"

export type GitRepository = Readonly<{
  repoOwner: string
  repoName: string
  defaultBaseBranch: string | null
}>

export function pendingGitState(
  ticket: Readonly<{
    branch: string | null
    pr: number | null
    prState: PullRequestState | null
    prBase?: string | null | undefined
  }>,
  github: GitRepository | null,
  branchDeletedAt: Date | null = null
): GitState {
  const defaultBase = github?.defaultBaseBranch ?? "main"
  if (!ticket.branch) return { tag: "no_branch", baseBranch: defaultBase }
  if (ticket.pr !== null) {
    const baseBranch = ticket.prBase ?? defaultBase
    const url = github
      ? `https://github.com/${github.repoOwner}/${github.repoName}/pull/${ticket.pr}`
      : ""
    if (ticket.prState === "merged") {
      return {
        tag: "pr_merged",
        branch: ticket.branch,
        baseBranch,
        number: ticket.pr,
        url,
        title: "",
        mergedAt: null
      }
    }
    if (ticket.prState === "closed") {
      return {
        tag: "pr_closed",
        branch: ticket.branch,
        baseBranch,
        number: ticket.pr,
        url,
        title: ""
      }
    }
    return {
      tag: "pr_pending",
      branch: ticket.branch,
      baseBranch,
      number: ticket.pr,
      url
    }
  }
  if (branchDeletedAt !== null) {
    return { tag: "stale_branch", name: ticket.branch }
  }
  return {
    tag: "branch_pending",
    name: ticket.branch,
    baseBranch: defaultBase
  }
}
