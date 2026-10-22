import type { GitState, GitStatesResponse, StackLayerState } from "@pp/shared"

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

const stackIdentity = (stack: ReadonlyArray<StackLayerState> = []): string =>
  JSON.stringify(
    stack.map((layer) => [
      layer.branch,
      layer.base,
      layer.depth,
      layer.deleted,
      layer.pr === null
        ? null
        : [layer.pr.number, layer.pr.state, layer.pr.draft, layer.pr.landed]
    ])
  )

export const changedGitStateTicketIds = (
  previous: GitStatesResponse | undefined,
  next: GitStatesResponse
): ReadonlyArray<string> => {
  if (!previous) return []
  const ticketIds = new Set([
    ...Object.keys(previous.states),
    ...Object.keys(next.states),
    ...Object.keys(previous.stacks ?? {}),
    ...Object.keys(next.stacks ?? {})
  ])
  return [...ticketIds].filter((ticketId) => {
    if (
      stackIdentity(previous.stacks?.[ticketId]) !==
      stackIdentity(next.stacks?.[ticketId])
    )
      return true
    const before = previous.states[ticketId]
    const after = next.states[ticketId]
    if (!before) return after !== undefined && after.tag !== "no_branch"
    if (!after) return true
    return gitStateIdentity(before) !== gitStateIdentity(after)
  })
}
