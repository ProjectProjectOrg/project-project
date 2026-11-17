import type { GitState } from "@pp/shared"

import type * as GitHub from "../github/GitHub"
import type * as ProjectGithub from "../github/ProjectGithub"
import type { PullRequestSnapshot } from "../github/PullRequestSnapshots"
import type * as TicketIndex from "../tickets/TicketIndex"
import { pendingGitState } from "../tickets/ticketPresentation"
import { pullRequestUrl } from "./stackLayerStates"

type StoredTicket = Pick<
  TicketIndex.TicketIndexEntry,
  "branch" | "pr" | "prState" | "prBase" | "branchDeletedAt"
>

export const storedGitState = (
  ticket: StoredTicket,
  github: ProjectGithub.ProjectGithubIntegration | null,
  snapshot: PullRequestSnapshot | undefined
): GitState => {
  const branch = ticket.branch
  if (branch === null || github === null) {
    return pendingGitState(ticket, github, ticket.branchDeletedAt)
  }
  if (ticket.pr === null) {
    return ticket.branchDeletedAt === null
      ? {
          tag: "branch_no_pr",
          name: branch,
          baseBranch: github.defaultBaseBranch
        }
      : { tag: "stale_branch", name: branch }
  }
  if (snapshot === undefined) {
    return pendingGitState(ticket, github, ticket.branchDeletedAt)
  }
  const pr = {
    branch,
    baseBranch: snapshot.base,
    number: snapshot.number,
    url: pullRequestUrl(github, snapshot.number),
    title: snapshot.title
  }
  if (snapshot.state === "merged") {
    return { tag: "pr_merged", ...pr, mergedAt: snapshot.mergedAt }
  }
  if (snapshot.state === "closed") return { tag: "pr_closed", ...pr }
  return {
    tag: "pr_open",
    ...pr,
    draft: snapshot.draft,
    checks: snapshot.checks ?? "none"
  }
}

export const snapshotBranches = (
  repository: ProjectGithub.ProjectGithubIntegration,
  snapshots: Iterable<PullRequestSnapshot>
): ReadonlyMap<string, GitHub.RawBranchEntry> =>
  new Map(
    [...snapshots].map((snapshot) => [
      snapshot.branch,
      {
        headRefName: snapshot.branch,
        baseRefName: snapshot.base,
        state: snapshot.state,
        draft: snapshot.draft,
        number: snapshot.number,
        url: pullRequestUrl(repository, snapshot.number),
        title: snapshot.title,
        mergedAt: snapshot.mergedAt,
        checks: snapshot.checks ?? "none"
      }
    ])
  )

export const snapshotsOf = (
  repositoryId: string,
  raw: GitHub.RawProjectStates
): ReadonlyArray<PullRequestSnapshot> => {
  const byNumber = new Map<number, GitHub.RawBranchEntry>()
  for (const history of raw.mergedPrsByBranch.values()) {
    for (const pr of history) byNumber.set(pr.number, pr)
  }
  for (const pr of raw.prByBranch.values()) byNumber.set(pr.number, pr)
  return [...byNumber.values()].map((pr) => ({
    repositoryId,
    number: pr.number,
    branch: pr.headRefName,
    base: pr.baseRefName,
    state: pr.state,
    draft: pr.draft,
    title: pr.title,
    mergedAt: pr.mergedAt,
    checks: pr.checks,
    observedAt: raw.fetchedAt
  }))
}
