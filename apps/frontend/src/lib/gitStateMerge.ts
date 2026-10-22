import type { GitStatesResponse, StackLayerState } from "@pp/shared"

export const mergeStackPrDetails = (
  previous: ReadonlyArray<StackLayerState> | undefined,
  next: ReadonlyArray<StackLayerState>
): ReadonlyArray<StackLayerState> =>
  next.map((layer) => {
    const prior = previous?.find(
      (candidate) => candidate.branch === layer.branch
    )
    if (
      layer.pr === null ||
      prior?.pr == null ||
      layer.pr.number !== prior.pr.number
    )
      return layer
    return {
      ...layer,
      pr: {
        ...layer.pr,
        title: layer.pr.title || prior.pr.title,
        checks:
          layer.pr.checks === null || layer.pr.checks === "none"
            ? prior.pr.checks
            : layer.pr.checks
      }
    }
  })

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
  if (!preserveStaleSummary || next.stacks === undefined)
    return { ...next, states }
  const stacks = Object.fromEntries(
    Object.entries(next.stacks).map(([ticketId, stack]) => [
      ticketId,
      mergeStackPrDetails(previous.stacks?.[ticketId], stack)
    ])
  )
  return { ...next, states, stacks }
}
