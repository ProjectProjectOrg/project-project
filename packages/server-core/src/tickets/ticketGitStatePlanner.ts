import type {
  GitState,
  TicketBranchEntry,
  TicketId,
  TicketStatus
} from "@pp/shared"
import * as Option from "effect/Option"

import type {
  RawBranchEntry,
  RawProjectStates,
  RawPullRequestText
} from "../github/GitHub"
import {
  pickPullRequestTicket,
  pullRequestTicketReferences,
  type PullRequestTicketPick
} from "./pullRequestTicketReference"
import {
  planLayerPullRequest,
  planStackAttach,
  type StackPullRequest
} from "./ticketStack"

type AutomaticBranchLinkTicket = Pick<TicketGitStateInput, "id" | "branch"> & {
  readonly archivedAt?: Date | null
  readonly stack?: ReadonlyArray<TicketBranchEntry> | undefined
}

const noPullRequestText: RawPullRequestText = { title: "", body: "" }

const pickBranchTicket = (
  branch: string,
  knownIds: ReadonlySet<string>,
  openPullRequestText: ReadonlyMap<string, RawPullRequestText>
): Option.Option<PullRequestTicketPick> =>
  pickPullRequestTicket(
    pullRequestTicketReferences({
      branch,
      ...(openPullRequestText.get(branch) ?? noPullRequestText)
    }),
    knownIds
  )

const chainBottom = (
  branches: ReadonlySet<string>,
  prByBranch: ReadonlyMap<string, RawBranchEntry>
): string | null => {
  const bottoms = [...branches].filter((branch) => {
    const base = prByBranch.get(branch)?.baseRefName
    return base === undefined || !branches.has(base)
  })
  return bottoms.length === 1 ? (bottoms[0] ?? null) : null
}

export function planAutomaticBranchLinks(
  tickets: ReadonlyArray<AutomaticBranchLinkTicket>,
  branches: ReadonlySet<string>,
  defaultBranch: string,
  openPullRequestText: ReadonlyMap<string, RawPullRequestText> = new Map(),
  prByBranch: ReadonlyMap<string, RawBranchEntry> = new Map()
): ReadonlyMap<TicketId, string> {
  const knownIds = new Set<string>(tickets.map((ticket) => ticket.id))
  const attachedBranches = new Set(
    tickets.flatMap((ticket) => [
      ...(ticket.branch === null ? [] : [ticket.branch]),
      ...(ticket.stack ?? []).map((layer) => layer.branch)
    ])
  )
  const eligibleIds = new Set(
    tickets
      .filter((ticket) => ticket.branch === null && ticket.archivedAt == null)
      .map((ticket) => ticket.id)
  )
  const candidates = new Map<TicketId, Set<string>>()

  for (const branch of branches) {
    if (branch === defaultBranch || attachedBranches.has(branch)) continue
    const pick = pickBranchTicket(branch, knownIds, openPullRequestText)
    if (Option.isNone(pick) || !eligibleIds.has(pick.value.ticketId)) continue
    const branchesForId = candidates.get(pick.value.ticketId) ?? new Set()
    branchesForId.add(branch)
    candidates.set(pick.value.ticketId, branchesForId)
  }

  const links = new Map<TicketId, string>()
  for (const [id, candidateBranches] of candidates) {
    const branch = chainBottom(candidateBranches, prByBranch)
    if (branch !== null) links.set(id, branch)
  }
  return links
}

type AutomaticStackTicket = AutomaticBranchLinkTicket & {
  readonly ignoredBranches?: ReadonlyArray<string> | undefined
}

/**
 * New stacked branches per ticket: unattached branches that name a ticket
 * (as `planAutomaticBranchLinks` picks them) whose own branch is set or just
 * linked in `ownLinks`, and that build on one of its branches or carry its
 * key in their name. Branches whose pull request was closed unmerged stay
 * out, as do branches without a pull request unless their name names the
 * ticket.
 */
export function planAutomaticStacks(
  tickets: ReadonlyArray<AutomaticStackTicket>,
  ownLinks: ReadonlyMap<TicketId, string>,
  branches: ReadonlySet<string>,
  defaultBranch: string,
  openPullRequestText: ReadonlyMap<string, RawPullRequestText> = new Map(),
  prByBranch: ReadonlyMap<string, RawBranchEntry> = new Map()
): ReadonlyMap<TicketId, ReadonlyArray<TicketBranchEntry>> {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const knownIds = new Set<string>(byId.keys())
  const attached = new Set([
    ...ownLinks.values(),
    ...tickets.flatMap((ticket) => [
      ...(ticket.branch === null ? [] : [ticket.branch]),
      ...(ticket.stack ?? []).map((layer) => layer.branch)
    ])
  ])
  const stacks = new Map<TicketId, Array<TicketBranchEntry>>()
  const attach = (branch: string): boolean => {
    const pick = pickBranchTicket(branch, knownIds, openPullRequestText)
    if (Option.isNone(pick)) return false
    const ticket = byId.get(pick.value.ticketId)
    const own = ticket?.branch ?? ownLinks.get(pick.value.ticketId) ?? null
    if (ticket === undefined || own === null) return false
    const added = stacks.get(ticket.id) ?? []
    const planned = {
      branch: own,
      stack: [...(ticket.stack ?? []), ...added],
      ignoredBranches: ticket.ignoredBranches,
      archivedAt: ticket.archivedAt ?? null
    }
    const pr = prByBranch.get(branch)
    if (pr?.state === "closed") return false
    const namedInBranch = pick.value.source === "branch"
    const layer =
      pr === undefined
        ? namedInBranch &&
          planned.archivedAt === null &&
          !(ticket.ignoredBranches ?? []).includes(branch)
          ? { branch }
          : null
        : planStackAttach(planned, stackPullRequest(branch, pr), namedInBranch)
    if (layer === null) return false
    stacks.set(ticket.id, [...added, layer])
    attached.add(branch)
    return true
  }

  let pending = [...branches]
    .filter((branch) => branch !== defaultBranch && !attached.has(branch))
    .toSorted()
  let attachedAny = true
  while (attachedAny) {
    const before = pending.length
    pending = pending.filter((branch) => !attach(branch))
    attachedAny = pending.length < before
  }
  return stacks
}

/** Each stacked branch brought up to its pull request's latest state. */
export const planStackPullRequests = (
  stack: ReadonlyArray<TicketBranchEntry> | undefined,
  prByBranch: ReadonlyMap<string, RawBranchEntry>
): ReadonlyArray<TicketBranchEntry> =>
  (stack ?? []).map((layer) => {
    const pr = prByBranch.get(layer.branch)
    return pr === undefined
      ? layer
      : (planLayerPullRequest(layer, stackPullRequest(layer.branch, pr)) ??
          layer)
  })

export const stackPullRequest = (
  branch: string,
  pr: RawBranchEntry
): StackPullRequest => ({
  branch,
  base: pr.baseRefName,
  number: pr.number,
  state: pr.state,
  draft: pr.draft
})

export interface TicketGitStateInput {
  readonly id: TicketId
  readonly status: TicketStatus
  readonly branch: string | null
  readonly pr: number | null
  readonly prState: "open" | "closed" | "merged" | null
  readonly prDraft: boolean
  readonly prBase?: string | null | undefined
  readonly lastTransitionedPr: number | null
}

export type TicketGitStatePatch = Readonly<{
  pr?: number | null
  prState?: TicketGitStateInput["prState"]
  prDraft?: boolean
  lastTransitionedPr?: number | null
  prBase?: string
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

    const planned = planPullRequestPatch(ticket, pr)
    const patch =
      planned !== null
        ? { ...planned, prBase: pr.baseRefName }
        : ticket.pr === pr.number && (ticket.prBase ?? null) !== pr.baseRefName
          ? { prBase: pr.baseRefName }
          : null
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
