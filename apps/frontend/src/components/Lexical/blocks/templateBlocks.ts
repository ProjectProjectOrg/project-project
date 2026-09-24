import type { TicketBlockNode } from "../TicketBlockNode"
import { $createSyncedBlockNode, type SyncedBlockNode } from "./SyncedBlockNode"

export function $revertToReference(node: TicketBlockNode): SyncedBlockNode {
  const reference = $createSyncedBlockNode(node.getBlockType(), "", "reference")
  node.replace(reference)
  reference.selectNext()
  return reference
}
