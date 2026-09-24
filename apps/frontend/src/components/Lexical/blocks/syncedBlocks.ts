import { $convertFromMarkdownString, type Transformer } from "@lexical/markdown"
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

import { syncedView } from "@/components/blocks/syncedContent"

import {
  $createTicketBlockNode,
  type TicketBlockNode
} from "../TicketBlockNode"
import {
  $isSyncedBlockNode,
  DETACH_SYNCED_BLOCK_COMMAND,
  SyncedBlockNode
} from "./SyncedBlockNode"

export function $detachSyncedBlock(
  node: SyncedBlockNode,
  content: string,
  transformers: ReadonlyArray<Transformer>
): TicketBlockNode {
  const block = $createTicketBlockNode(node.getBlockType())
  node.replace(block)
  $convertFromMarkdownString(content, [...transformers], block)
  if (block.isEmpty()) block.append($createParagraphNode())
  return block
}

function $copyRemovedSource(
  node: SyncedBlockNode,
  transformers: ReadonlyArray<Transformer>
): TicketBlockNode {
  const selection = $getSelection()
  const kept =
    selection === null ||
    ($isNodeSelection(selection) && selection.has(node.getKey()))
      ? null
      : selection.clone()
  const block = $detachSyncedBlock(node, node.getSnapshot(), transformers)
  if (kept !== null || selection === null) $setSelection(kept)
  return block
}

export function registerSyncedBlocks(
  editor: LexicalEditor,
  lookup: BlockLookup,
  transformers: ReadonlyArray<Transformer>,
  onSourceRemoved: (key: NodeKey) => void
): () => void {
  return mergeRegister(
    editor.registerNodeTransform(SyncedBlockNode, (node) => {
      const view = syncedView(lookup, node.getBlockType(), node.getSnapshot())
      if (view.kind === "removed") {
        onSourceRemoved($copyRemovedSource(node, transformers).getKey())
        return
      }
      if (view.content !== node.getSnapshot()) node.setSnapshot(view.content)
    }),
    editor.registerCommand(
      DETACH_SYNCED_BLOCK_COMMAND,
      ({ key, content }) => {
        const node = $getNodeByKey(key)
        if (!$isSyncedBlockNode(node)) return false
        $detachSyncedBlock(node, content, transformers)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  )
}
