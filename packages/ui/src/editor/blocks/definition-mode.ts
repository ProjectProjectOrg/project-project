import type { Transformer } from "@lexical/markdown"
import { mergeRegister } from "@lexical/utils"
import { defineExtension, type LexicalEditor } from "lexical"

import { HintNode } from "../../editor/hint-node"
import { $unwrapBlock } from "./block-commands"
import { SyncedBlockNode } from "./synced-block-node"
import { TicketBlockNode } from "./ticket-block-node"

export const HintExtension = defineExtension({
  name: "@pp/block-hint",
  nodes: [HintNode]
})

export const registerNoNestedBlocks = (
  editor: LexicalEditor,
  transformers: ReadonlyArray<Transformer>
) =>
  mergeRegister(
    editor.registerNodeTransform(TicketBlockNode, (node) => {
      $unwrapBlock(node, "", transformers)
    }),
    editor.registerNodeTransform(SyncedBlockNode, (node) => {
      $unwrapBlock(node, node.getSnapshot(), transformers)
    })
  )
