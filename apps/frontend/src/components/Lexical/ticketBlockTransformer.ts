import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type MultilineElementTransformer,
  type Transformer
} from "@lexical/markdown"
import {
  TICKET_BLOCK_OPEN,
  findTicketBlockEnd,
  formatTicketBlock
} from "@pp/shared"

import {
  $createTicketBlockNode,
  $isTicketBlockNode,
  TicketBlockNode
} from "./TicketBlockNode"

export function createTicketBlockTransformer(
  transformers: Transformer[]
): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [TicketBlockNode],
    regExpStart: TICKET_BLOCK_OPEN,
    replace: () => false,
    handleImportAfterStartMatch: ({
      lines,
      rootNode,
      startLineIndex,
      startMatch
    }) => {
      const end = findTicketBlockEnd(lines, startLineIndex)
      if (end === null) return null
      const block = $createTicketBlockNode(startMatch[1])
      rootNode.append(block)
      $convertFromMarkdownString(
        lines.slice(startLineIndex + 1, end).join("\n"),
        transformers,
        block
      )
      return [true, end]
    },
    export: (node) =>
      $isTicketBlockNode(node)
        ? formatTicketBlock(
            node.getBlockType(),
            $convertToMarkdownString(transformers, node)
          )
        : null
  }
}
