import type {
  GitAutomationEvent,
  GitAutomationRules,
  StatusSlug,
  TicketBranchEntry,
  TicketStatus
} from "@pp/shared"

export type GitAutomationConfig = Readonly<{
  rules: GitAutomationRules
  forwardOnly: boolean
  statusOrder: ReadonlyArray<string>
}>

export type TicketGitFields = Readonly<{
  status: TicketStatus
  branch: string | null
  pr: number | null
  prState: "open" | "closed" | "merged" | null
  prDraft?: boolean
  lastTransitionedPr: number | null
  stack?: ReadonlyArray<TicketBranchEntry>
}>

/**
 * Where a ticket's pull requests stand together: `open` while any is open
 * for review (`draft` when all open ones are drafts), `landed` once every
 * merged one has reached the default branch, `merged` while some wait to,
 * and `closed` when all were closed unmerged. Closed pull requests next to
 * others don't count.
 */
export type TicketPullRequestState =
  | "open"
  | "draft"
  | "merged"
  | "landed"
  | "closed"
  | null

type PullRequestStanding = Readonly<{
  state: "open" | "closed" | "merged"
  draft: boolean
  landed: boolean
}>

const pullRequestStandings = (
  ticket: TicketGitFields
): ReadonlyArray<PullRequestStanding> => [
  ...(ticket.pr === null || ticket.prState === null
    ? []
    : [
        {
          state: ticket.prState,
          draft: ticket.prDraft ?? false,
          landed:
            ticket.prState === "merged" &&
            ticket.lastTransitionedPr === ticket.pr
        }
      ]),
  ...(ticket.stack ?? []).flatMap((layer) =>
    layer.pr === undefined || layer.prState === undefined
      ? []
      : [
          {
            state: layer.prState,
            draft: layer.prDraft ?? false,
            landed: layer.prState === "merged" && (layer.landed ?? false)
          }
        ]
  )
]

export const ticketPullRequestState = (
  ticket: TicketGitFields
): TicketPullRequestState => {
  const standings = pullRequestStandings(ticket)
  if (standings.length === 0) return null
  const live = standings.filter((standing) => standing.state !== "closed")
  if (live.length === 0) return "closed"
  const open = live.filter((standing) => standing.state === "open")
  if (open.some((standing) => !standing.draft)) return "open"
  if (open.length > 0) return "draft"
  return live.every((standing) => standing.landed) ? "landed" : "merged"
}

const pullRequestEvents: Readonly<
  Record<NonNullable<TicketPullRequestState>, GitAutomationEvent | null>
> = {
  open: "pr_opened",
  draft: "pr_draft_opened",
  merged: null,
  landed: "pr_merged",
  closed: "pr_closed"
}

export const gitAutomationEvent = (
  before: TicketGitFields,
  after: TicketGitFields
): GitAutomationEvent | null => {
  const from = ticketPullRequestState(before)
  const to = ticketPullRequestState(after)
  if (to !== null && from !== to) return pullRequestEvents[to]
  return after.branch !== null && before.branch !== after.branch
    ? "branch_linked"
    : null
}

export const planGitAutomation = (
  status: TicketStatus,
  event: GitAutomationEvent,
  config: GitAutomationConfig
): StatusSlug | null => {
  const target = config.rules[event]
  if (target === null || target === status) return null
  if (config.forwardOnly) {
    const from = config.statusOrder.indexOf(status)
    const to = config.statusOrder.indexOf(target)
    if (from !== -1 && to !== -1 && to < from) return null
  }
  return target
}
