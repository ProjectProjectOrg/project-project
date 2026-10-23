import type { Transformer } from "@lexical/markdown"
import { mergeRegister } from "@lexical/utils"
import { defineExtension, type LexicalEditor } from "lexical"

import { TicketBlockNode } from "../TicketBlockNode"
import { $unwrapBlock } from "./blockCommands"
import { HintNode } from "./HintNode"
import { SyncedBlockNode } from "./SyncedBlockNode"

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
