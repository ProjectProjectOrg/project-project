import {
  $createSyncedBlockNode,
  type SyncedBlockNode
} from "./synced-block-node"
import type { TicketBlockNode } from "./ticket-block-node"

export function $revertToReference(node: TicketBlockNode): SyncedBlockNode {
  const reference = $createSyncedBlockNode(node.getBlockType(), "", "reference")
  node.replace(reference)
  reference.selectNext()
  return reference
}
