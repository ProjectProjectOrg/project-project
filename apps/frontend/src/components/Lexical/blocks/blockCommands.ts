import type { Transformer } from "@lexical/markdown"
import { $findMatchingParent } from "@lexical/utils"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalNode
} from "lexical"

import { $isTicketBlockNode, type TicketBlockNode } from "../TicketBlockNode"
import { $isSyncedBlockNode, type SyncedBlockNode } from "./SyncedBlockNode"
import { $detachSyncedBlock } from "./syncedBlocks"

export type TopLevelBlockNode = TicketBlockNode | SyncedBlockNode

export const $isTopLevelBlockNode = (
  node: LexicalNode | null | undefined
): node is TopLevelBlockNode =>
  $isTicketBlockNode(node) || $isSyncedBlockNode(node)

export function $topLevelBlocks(): ReadonlyArray<TopLevelBlockNode> {
  return $getRoot().getChildren().filter($isTopLevelBlockNode)
}

export function $findBlockAtSelection(): TopLevelBlockNode | null {
  const selection = $getSelection()
  const node = $isRangeSelection(selection)
    ? selection.anchor.getNode()
    : selection?.getNodes()[0]
  if (node === undefined) return null
  const block = $findMatchingParent(
    node,
    (candidate) =>
      $isTopLevelBlockNode(candidate) && candidate.getParent() === $getRoot()
  )
  return $isTopLevelBlockNode(block) ? block : null
}

export function $unwrapBlock(
  node: TopLevelBlockNode,
  content: string,
  transformers: ReadonlyArray<Transformer>
): ReadonlyArray<LexicalNode> {
  const block = $isSyncedBlockNode(node)
    ? $detachSyncedBlock(node, content, transformers)
    : node
  const children = block.getChildren()
  for (const child of children) block.insertBefore(child)
  block.remove()
  return children
}
