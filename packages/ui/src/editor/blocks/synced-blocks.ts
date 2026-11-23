import { $convertFromMarkdownString } from "@lexical/mdast"
import { mergeRegister } from "@lexical/utils"
import type { BlockLookup } from "@pp/shared"
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalEditor,
  type NodeKey
} from "lexical"

import {
  $isSyncedBlockNode,
  DETACH_SYNCED_BLOCK_COMMAND,
  SyncedBlockNode
} from "./synced-block-node"
import { SyncedView, syncedView } from "./synced-content"
import { $createTicketBlockNode } from "./ticket-block-node"

export function $detachSyncedBlock(node: SyncedBlockNode, content: string) {
  const block = $createTicketBlockNode(node.getBlockType())
  node.replace(block)
  $convertFromMarkdownString(content, block)
  if (block.isEmpty()) block.append($createParagraphNode())
  return block
}

function $copyRemovedSource(node: SyncedBlockNode) {
  const selection = $getSelection()
  const kept =
    selection === null ||
    ($isNodeSelection(selection) && selection.has(node.getKey()))
      ? null
      : selection.clone()
  const block = $detachSyncedBlock(node, node.getSnapshot())
  if (kept !== null || selection === null) $setSelection(kept)
  return block
}

export function registerSyncedBlocks(
  editor: LexicalEditor,
  lookup: BlockLookup,
  onSourceRemoved: (key: NodeKey) => void
) {
  return mergeRegister(
    editor.registerNodeTransform(SyncedBlockNode, (node) => {
      const view = syncedView(
        lookup,
        node.getBlockType(),
        node.getSnapshot(),
        node.getMode()
      )
      if (SyncedView.$is("removed")(view)) {
        onSourceRemoved($copyRemovedSource(node).getKey())
        return
      }
      if (node.getMode() === "synced" && view.content !== node.getSnapshot())
        node.setSnapshot(view.content)
    }),
    editor.registerCommand(
      DETACH_SYNCED_BLOCK_COMMAND,
      ({ key, content }) => {
        const node = $getNodeByKey(key)
        if (!$isSyncedBlockNode(node)) return false
        $detachSyncedBlock(node, content)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  )
}
