import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type MultilineElementTransformer,
  type Transformer
} from "@lexical/markdown"
import {
  TICKET_BLOCK_OPEN,
  findTicketBlockEnd,
  formatTicketBlock,
  isInsideFenceOrComment
} from "@pp/shared"

import {
  $createSyncedBlockNode,
  $isSyncedBlockNode,
  SyncedBlockNode
} from "./blocks/SyncedBlockNode"
import {
  $createTicketBlockNode,
  $isTicketBlockNode,
  TicketBlockNode
} from "./TicketBlockNode"

const trimBlankLines = (content: string): string =>
  content.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "")

export type TicketBlockTransformerOptions = Readonly<{
  emptyAsReference?: boolean
}>

export function createTicketBlockTransformer(
  transformers: ReadonlyArray<Transformer>,
  options?: TicketBlockTransformerOptions
): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [TicketBlockNode, SyncedBlockNode],
    regExpStart: TICKET_BLOCK_OPEN,
    replace: () => false,
    handleImportAfterStartMatch: ({
      lines,
      rootNode,
      startLineIndex,
      startMatch
    }) => {
      if (isInsideFenceOrComment(lines, startLineIndex)) return null
      const end = findTicketBlockEnd(lines, startLineIndex)
      if (end === null) return null
      const content = lines.slice(startLineIndex + 1, end).join("\n")
      if (startMatch[2] !== undefined) {
        rootNode.append(
          $createSyncedBlockNode(startMatch[1], trimBlankLines(content))
        )
        return [true, end]
      }
      if (options?.emptyAsReference === true && content.trim() === "") {
        rootNode.append($createSyncedBlockNode(startMatch[1], "", "reference"))
        return [true, end]
      }
      const block = $createTicketBlockNode(startMatch[1])
      rootNode.append(block)
      $convertFromMarkdownString(content, [...transformers], block)
      return [true, end]
    },
    export: (node) => {
      if ($isSyncedBlockNode(node))
        return node.getMode() === "reference"
          ? formatTicketBlock(node.getBlockType(), "")
          : formatTicketBlock(node.getBlockType(), node.getSnapshot(), {
              sync: true
            })
      return $isTicketBlockNode(node)
        ? formatTicketBlock(
            node.getBlockType(),
            $convertToMarkdownString([...transformers], node)
          )
        : null
    }
  }
}
