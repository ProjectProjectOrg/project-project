import type { TicketBranchEntry } from "@pp/shared"

export interface OrderedStackLayer {
  readonly layer: TicketBranchEntry
  /** 1 for a layer on the ticket's own branch, 2 for the one on top of that. */
  readonly depth: number
}

/**
 * Orders a ticket's stacked branches bottom to top by following each one's
 * base branch up from the ticket's own branch. Layers sharing a base keep
 * their stored order; a layer whose base isn't in the chain goes last, at
 * depth 1.
 */
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
  for (const layer of layers) {
    if (placed.has(layer.branch)) continue
    placed.add(layer.branch)
    ordered.push({ layer, depth: 1 })
    climb(layer.branch, 2)
  }
  return ordered
}
