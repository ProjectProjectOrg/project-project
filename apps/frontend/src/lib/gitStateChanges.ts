import type { GitState, GitStatesResponse } from "@pp/shared"

export const shouldInvalidateTicketsForGitStates = (
  states: Pick<GitStatesResponse, "transitioned"> &
    Partial<Pick<GitStatesResponse, "changedTicketIds">>
): boolean =>
  states.transitioned.length > 0 || (states.changedTicketIds?.length ?? 0) > 0

const gitStateIdentity = (state: GitState): string => {
  switch (state.tag) {
    case "branch_no_pr":
    case "branch_pending":
    case "stale_branch":
      return `${state.tag}:${state.name}`
    case "pr_closed":
    case "pr_merged":
    case "pr_open":
    case "pr_pending":
      return `${state.tag}:${state.branch}:${state.number}`
    case "no_branch":
      return state.tag
  }
}

export const changedGitStateTicketIds = (
  previous: GitStatesResponse | undefined,
  next: GitStatesResponse
): ReadonlyArray<string> => {
  if (!previous) return []
  const ticketIds = new Set([
    ...Object.keys(previous.states),
    ...Object.keys(next.states)
  ])
  return [...ticketIds].filter((ticketId) => {
    const before = previous.states[ticketId]
    const after = next.states[ticketId]
    if (!before) return after?.tag !== "no_branch"
    if (!after) return true
    return gitStateIdentity(before) !== gitStateIdentity(after)
  })
}
