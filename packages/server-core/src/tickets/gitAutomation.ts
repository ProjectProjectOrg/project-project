import type {
  GitAutomationEvent,
  GitAutomationRules,
  StatusSlug,
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
}>

export type GitEventContext = Readonly<{
  defaultBranch: string | null
  pullRequestBase: string | null
}>

const pullRequestEvent = (
  before: TicketGitFields,
  after: TicketGitFields,
  context: GitEventContext
): GitAutomationEvent | null => {
  if (after.pr === null) return null
  const changed =
    before.pr !== after.pr ||
    before.prState !== after.prState ||
    (before.prDraft ?? false) !== (after.prDraft ?? false)
  if (!changed) return null
  if (after.prState === "merged") {
    if (before.lastTransitionedPr === after.pr) return null
    const intoOtherBranch =
      context.defaultBranch !== null &&
      context.pullRequestBase !== null &&
      context.pullRequestBase !== context.defaultBranch
    return intoOtherBranch ? null : "pr_merged"
  }
  if (after.prState === "closed") return "pr_closed"
  if (after.prState === "open") {
    return after.prDraft ? "pr_draft_opened" : "pr_opened"
  }
  return null
}

export const gitAutomationEvent = (
  before: TicketGitFields,
  after: TicketGitFields,
  context: GitEventContext
): GitAutomationEvent | null => {
  const pullRequest = pullRequestEvent(before, after, context)
  if (pullRequest !== null) return pullRequest
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
