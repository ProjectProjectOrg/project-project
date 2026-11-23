import { mergeRegister } from "@lexical/utils"
import { defineExtension, TextNode, type LexicalEditor } from "lexical"

import { $convertTrailingHint, HintNode } from "../../editor/hint-node"
import { $unwrapBlock } from "./block-commands"
import { SyncedBlockNode } from "./synced-block-node"
import { TicketBlockNode } from "./ticket-block-node"

export const HintExtension = defineExtension({
  name: "@pp/block-hint",
  nodes: [HintNode],
  register: (editor) =>
    editor.registerNodeTransform(TextNode, $convertTrailingHint)
})

export const registerNoNestedBlocks = (editor: LexicalEditor) =>
  mergeRegister(
    editor.registerNodeTransform(TicketBlockNode, (node) => {
      $unwrapBlock(node, "")
    }),
    editor.registerNodeTransform(SyncedBlockNode, (node) => {
      $unwrapBlock(node, node.getSnapshot())
    })
  )
