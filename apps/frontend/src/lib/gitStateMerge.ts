import type { GitStatesResponse } from "@pp/shared"

/** Carries PR titles and checks from an earlier response through a degraded one, so a stale read does not blank data the user can see. */
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
