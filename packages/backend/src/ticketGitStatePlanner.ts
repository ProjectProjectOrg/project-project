import type {
  GitState,
  TicketId,
  TicketStatus,
  TransitionRecord
} from "@projectproject/shared"
import type { RawProjectStates } from "./Services/GitHub"

export interface TicketGitStateInput {
  readonly id: TicketId
  readonly status: TicketStatus
  readonly branch: string | null
  readonly pr: number | null
  readonly prState: "open" | "closed" | "merged" | null
  readonly lastTransitionedPr: number | null
}

export interface TicketGitStateWrite {
  readonly ticketId: TicketId
  readonly patch: {
    readonly pr?: number | null
    readonly prState?: TicketGitStateInput["prState"]
    readonly lastTransitionedPr?: number | null
    readonly status?: TicketGitStateInput["status"]
  }
}

export interface PullRequestWebhookInput {
  readonly number: number
  readonly state: "open" | "closed" | "merged"
}

export interface TicketGitStatePlan {
  readonly states: Record<string, GitState>
  readonly transitioned: ReadonlyArray<TransitionRecord>
  readonly writes: ReadonlyArray<TicketGitStateWrite>
}

export function planPullRequestWebhookTicket(
  ticket: TicketGitStateInput,
  pr: PullRequestWebhookInput
): TicketGitStateWrite | null {
  if (pr.state === "merged") {
    if (ticket.status !== "done" && ticket.lastTransitionedPr !== pr.number) {
      return {
        ticketId: ticket.id,
        patch: {
          status: "done" as TicketStatus,
          pr: pr.number,
          prState: "merged",
          lastTransitionedPr: pr.number
        }
      }
    }
    if (ticket.lastTransitionedPr !== pr.number) {
      return {
        ticketId: ticket.id,
        patch: {
          pr: pr.number,
          prState: "merged",
          lastTransitionedPr: pr.number
        }
      }
    }
    if (ticket.pr !== pr.number || ticket.prState !== "merged") {
      return {
        ticketId: ticket.id,
        patch: { pr: pr.number, prState: "merged" }
      }
    }
    return null
  }

  if (ticket.pr !== pr.number || ticket.prState !== pr.state) {
    return { ticketId: ticket.id, patch: { pr: pr.number, prState: pr.state } }
  }
  return null
}

export function planTicketGitStates(
  tickets: ReadonlyArray<TicketGitStateInput>,
  raw: RawProjectStates,
  now: Date
): TicketGitStatePlan {
  const states: Record<string, GitState> = {}
  const transitioned: TransitionRecord[] = []
  const writes: TicketGitStateWrite[] = []

  for (const ticket of tickets) {
    if (!ticket.branch) {
      states[ticket.id] = { tag: "no_branch", baseBranch: raw.defaultBranch }
      continue
    }

    const pr = raw.prByBranch.get(ticket.branch)
    const branchExists = raw.existingBranches.has(ticket.branch)

    if (!pr && !branchExists) {
      states[ticket.id] = { tag: "stale_branch", name: ticket.branch }
      continue
    }

    if (!pr) {
      states[ticket.id] = {
        tag: "branch_no_pr",
        name: ticket.branch,
        baseBranch: raw.defaultBranch
      }
      continue
    }

    if (pr.state === "merged") {
      if (ticket.status !== "done" && ticket.lastTransitionedPr !== pr.number) {
        writes.push({
          ticketId: ticket.id,
          patch: {
            status: "done" as TicketStatus,
            pr: pr.number,
            prState: "merged",
            lastTransitionedPr: pr.number
          }
        })
        transitioned.push({
          ticketId: ticket.id,
          fromStatus: ticket.status,
          toStatus: "done" as TicketStatus,
          prNumber: pr.number
        })
      } else if (ticket.lastTransitionedPr !== pr.number) {
        writes.push({
          ticketId: ticket.id,
          patch: {
            pr: pr.number,
            prState: "merged",
            lastTransitionedPr: pr.number
          }
        })
      } else if (ticket.pr !== pr.number || ticket.prState !== "merged") {
        writes.push({
          ticketId: ticket.id,
          patch: { pr: pr.number, prState: "merged" }
        })
      }

      states[ticket.id] = {
        tag: "pr_merged",
        branch: ticket.branch,
        baseBranch: pr.baseRefName,
        number: pr.number,
        url: pr.url,
        title: pr.title,
        mergedAt: pr.mergedAt ?? now
      }
      continue
    }

    if (ticket.pr !== pr.number || ticket.prState !== pr.state) {
      writes.push({
        ticketId: ticket.id,
        patch: { pr: pr.number, prState: pr.state }
      })
    }

    if (pr.state === "closed") {
      states[ticket.id] = {
        tag: "pr_closed",
        branch: ticket.branch,
        baseBranch: pr.baseRefName,
        number: pr.number,
        url: pr.url,
        title: pr.title
      }
      continue
    }

    states[ticket.id] = {
      tag: "pr_open",
      branch: ticket.branch,
      baseBranch: pr.baseRefName,
      number: pr.number,
      url: pr.url,
      draft: pr.draft,
      title: pr.title,
      checks: pr.checks
    }
  }

  return { states, transitioned, writes }
}
