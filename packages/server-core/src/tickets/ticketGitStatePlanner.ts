import type { GitState, TicketId, TicketStatus } from "@pp/shared"
import * as Option from "effect/Option"

import type { RawProjectStates, RawPullRequestText } from "../github/GitHub"
import {
  pickPullRequestTicket,
  pullRequestTicketReferences
} from "./pullRequestTicketReference"

type AutomaticBranchLinkTicket = Pick<TicketGitStateInput, "id" | "branch"> & {
  readonly archivedAt?: Date | null
}

const noPullRequestText: RawPullRequestText = { title: "", body: "" }

export function planAutomaticBranchLinks(
  tickets: ReadonlyArray<AutomaticBranchLinkTicket>,
  branches: ReadonlySet<string>,
  defaultBranch: string,
  openPullRequestText: ReadonlyMap<string, RawPullRequestText> = new Map()
): ReadonlyMap<TicketId, string> {
  const knownIds = new Set<string>(tickets.map((ticket) => ticket.id))
  const attachedBranches = new Set(
    tickets.flatMap((ticket) => (ticket.branch === null ? [] : [ticket.branch]))
  )
  const eligibleIds = new Set(
    tickets
      .filter((ticket) => ticket.branch === null && ticket.archivedAt == null)
      .map((ticket) => ticket.id)
  )
  const candidates = new Map<TicketId, Set<string>>()

  for (const branch of branches) {
    if (branch === defaultBranch || attachedBranches.has(branch)) continue
    const pick = pickPullRequestTicket(
      pullRequestTicketReferences({
        branch,
        ...(openPullRequestText.get(branch) ?? noPullRequestText)
      }),
      knownIds
    )
    if (Option.isNone(pick) || !eligibleIds.has(pick.value.ticketId)) continue
    const branchesForId = candidates.get(pick.value.ticketId) ?? new Set()
    branchesForId.add(branch)
    candidates.set(pick.value.ticketId, branchesForId)
  }

  const links = new Map<TicketId, string>()
  for (const [id, candidateBranches] of candidates) {
    if (candidateBranches.size !== 1) continue
    const [branch] = candidateBranches
    if (branch !== undefined) links.set(id, branch)
  }
  return links
}

export interface TicketGitStateInput {
  readonly id: TicketId
  readonly status: TicketStatus
  readonly branch: string | null
  readonly pr: number | null
  readonly prState: "open" | "closed" | "merged" | null
  readonly prDraft: boolean
  readonly lastTransitionedPr: number | null
}

export type TicketGitStatePatch = Readonly<{
  pr?: number | null
  prState?: TicketGitStateInput["prState"]
  prDraft?: boolean
  lastTransitionedPr?: number | null
}>

export interface TicketGitStateWrite {
  readonly ticketId: TicketId
  readonly patch: TicketGitStatePatch
  readonly pullRequestBase: string | null
}

export interface PullRequestWebhookInput {
  readonly number: number
  readonly state: "open" | "closed" | "merged"
  readonly draft: boolean
}

export interface TicketGitStatePlan {
  readonly states: Record<string, GitState>
  readonly writes: ReadonlyArray<TicketGitStateWrite>
}

export function planPullRequestPatch(
  ticket: TicketGitStateInput,
  pr: PullRequestWebhookInput
): TicketGitStatePatch | null {
  if (pr.state === "merged") {
    return ticket.pr === pr.number &&
      ticket.prState === "merged" &&
      ticket.lastTransitionedPr === pr.number
      ? null
      : {
          pr: pr.number,
          prState: "merged",
          prDraft: false,
          lastTransitionedPr: pr.number
        }
  }
  const draft = pr.state === "open" && pr.draft
  return ticket.pr === pr.number &&
    ticket.prState === pr.state &&
    ticket.prDraft === draft
    ? null
    : { pr: pr.number, prState: pr.state, prDraft: draft }
}

export function planPullRequestWebhookTicket(
  ticket: TicketGitStateInput,
  pr: PullRequestWebhookInput
): TicketGitStatePatch | null {
  if (
    ticket.pr === pr.number &&
    ticket.prState === "merged" &&
    pr.state !== "merged"
  ) {
    return null
  }
  return planPullRequestPatch(ticket, pr)
}

export function planTicketGitStates(
  tickets: ReadonlyArray<TicketGitStateInput>,
  raw: RawProjectStates,
  now: Date
): TicketGitStatePlan {
  const states: Record<string, GitState> = {}
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

    const patch = planPullRequestPatch(ticket, pr)
    if (patch) {
      writes.push({
        ticketId: ticket.id,
        patch,
        pullRequestBase: pr.baseRefName
      })
    }

    if (pr.state === "merged") {
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

  return { states, writes }
}
