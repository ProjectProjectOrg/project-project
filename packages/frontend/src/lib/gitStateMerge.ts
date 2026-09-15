import type { GitStatesResponse } from "@projectproject/shared"

/**
 * Merges a degraded git-states response with a better earlier one.
 *
 * A stale or rate-limited read from GitHub comes back without PR titles and
 * with `checks: "none"`, and can fall all the way back to `branch_pending`.
 * Rendering that verbatim would blank out summaries the user can already see,
 * so the earlier values are carried over until a `fresh` response replaces
 * them. A repository change or a disconnect drops the earlier values entirely.
 */
export const mergeStaleGitStateDetails = (
  previous: GitStatesResponse | undefined,
  next: GitStatesResponse,
  repoChanged: boolean
): GitStatesResponse => {
  if (repoChanged || !previous || next.repoStatus === "not_connected") {
    return next
  }
  const preserveDetails = next.refreshStatus !== "fresh"
  const preserveStaleSummary =
    next.refreshStatus === "stale" || next.refreshStatus === "rate_limited"
  const states = Object.fromEntries(
    Object.entries(next.states).map(([ticketId, state]) => {
      const prior = previous.states[ticketId]
      if (
        preserveDetails &&
        state.tag === "pr_open" &&
        prior?.tag === "pr_open" &&
        state.branch === prior.branch &&
        state.number === prior.number
      ) {
        return [
          ticketId,
          {
            ...state,
            title:
              preserveStaleSummary && !state.title ? prior.title : state.title,
            checks:
              preserveStaleSummary && state.checks === "none"
                ? prior.checks
                : state.checks
          }
        ]
      }
      if (
        preserveStaleSummary &&
        state.tag === "branch_pending" &&
        prior?.tag === "pr_open" &&
        state.name === prior.branch
      ) {
        return [ticketId, prior]
      }
      return [ticketId, state]
    })
  )
  return { ...next, states }
}
