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
  for (const layer of layers) {
    if (placed.has(layer.branch)) continue
    placed.add(layer.branch)
    ordered.push({ layer, depth: 1 })
    climb(layer.branch, 2)
  }
  return ordered
}
