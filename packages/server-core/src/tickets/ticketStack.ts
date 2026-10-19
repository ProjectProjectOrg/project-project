import type { TicketBranchEntry } from "@pp/shared"

export type OrderedStackLayer = Readonly<{
  layer: TicketBranchEntry
  depth: number
}>

export const orderStackLayers = (
  ownBranch: string | null,
  stack: ReadonlyArray<TicketBranchEntry> | undefined
): ReadonlyArray<OrderedStackLayer> => {
  const layers = stack ?? []
  const ordered: Array<OrderedStackLayer> = []
  const placed = new Set<string>()
  const climb = (base: string, depth: number) => {
    for (const layer of layers) {
      if (layer.base !== base || placed.has(layer.branch)) continue
      placed.add(layer.branch)
      ordered.push({ layer, depth })
      climb(layer.branch, depth + 1)
    }
  }
  if (ownBranch !== null) climb(ownBranch, 1)
  const names = new Set(layers.map((layer) => layer.branch))
  const roots = layers.filter(
    (layer) => layer.base === undefined || !names.has(layer.base)
  )
  for (const layer of [...roots, ...layers]) {
    if (placed.has(layer.branch)) continue
    placed.add(layer.branch)
    ordered.push({ layer, depth: 1 })
    climb(layer.branch, 2)
  }
  return ordered
}

export interface StackPullRequest {
  readonly branch: string
  readonly base: string
  readonly number: number
  readonly state: "open" | "closed" | "merged"
  readonly draft: boolean
}

type StackTicket = Readonly<{
  branch: string | null
  stack?: ReadonlyArray<TicketBranchEntry> | undefined
  ignoredBranches?: ReadonlyArray<string> | undefined
  archivedAt: Date | null
}>

/** The ticket's own branch and every branch stacked on it. */
export const ticketBranches = (ticket: StackTicket): ReadonlySet<string> =>
  new Set([
    ...(ticket.branch === null ? [] : [ticket.branch]),
    ...(ticket.stack ?? []).map((layer) => layer.branch)
  ])

const layerFor = (pr: StackPullRequest): TicketBranchEntry =>
  Object.assign(
    { branch: pr.branch, base: pr.base, pr: pr.number, prState: pr.state },
    pr.state === "open" && pr.draft ? { prDraft: true } : {}
  )

/**
 * The layer a pull request adds to a ticket that already has a branch, or
 * null when it doesn't belong there. It belongs when it builds on one of the
 * ticket's branches, or when its own branch name names the ticket.
 */
export const planStackAttach = (
  ticket: StackTicket,
  pr: StackPullRequest,
  namedInBranch: boolean
): TicketBranchEntry | null => {
  if (ticket.branch === null || ticket.archivedAt !== null) return null
  const branches = ticketBranches(ticket)
  if (branches.has(pr.branch)) return null
  if ((ticket.ignoredBranches ?? []).includes(pr.branch)) return null
  return branches.has(pr.base) || namedInBranch ? layerFor(pr) : null
}

/**
 * A layer updated to its pull request's latest state, or null when nothing
 * changed or the update is older than what the layer already holds.
 */
export const planLayerPullRequest = (
  layer: TicketBranchEntry,
  pr: StackPullRequest
): TicketBranchEntry | null => {
  if (layer.pr !== undefined && pr.number < layer.pr) return null
  if (
    layer.pr === pr.number &&
    layer.prState === "merged" &&
    pr.state !== "merged"
  ) {
    return null
  }
  const next = Object.assign(
    layerFor(pr),
    layer.landed && layer.pr === pr.number && pr.state === "merged"
      ? { landed: true }
      : {}
  )
  const same =
    layer.base === next.base &&
    layer.pr === next.pr &&
    layer.prState === next.prState &&
    (layer.prDraft ?? false) === (next.prDraft ?? false) &&
    (layer.landed ?? false) === (next.landed ?? false)
  return same ? null : next
}

/** `stack` with the layer for `branch` replaced. */
export const replaceLayer = (
  stack: ReadonlyArray<TicketBranchEntry> | undefined,
  layer: TicketBranchEntry
): ReadonlyArray<TicketBranchEntry> =>
  (stack ?? []).map((current) =>
    current.branch === layer.branch ? layer : current
  )
