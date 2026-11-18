import { $createSyncedBlockNode } from "./synced-block-node"
import type { TicketBlockNode } from "./ticket-block-node"

export function $revertToReference(node: TicketBlockNode) {
  const reference = $createSyncedBlockNode(node.getBlockType(), "", "reference")
  node.replace(reference)
  reference.selectNext()
  return reference
}
