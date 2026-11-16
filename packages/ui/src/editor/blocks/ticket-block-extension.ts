import { mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  defineExtension,
  type LexicalEditor,
  type ParagraphNode
} from "lexical"

import { $isTicketBlockNode, TicketBlockNode } from "./TicketBlockNode"

const $unwrap = (block: TicketBlockNode) => {
  for (const child of block.getChildren()) block.insertBefore(child)
  block.remove()
}

const $isBlankLine = (line: ParagraphNode) =>
  line
    .getChildren()
    .every((child) => $isTextNode(child) && child.getTextContent() === "")

export function $exitTicketBlockFromEmptyLastLine(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
  const anchor = selection.anchor.getNode()
  const line = $isParagraphNode(anchor) ? anchor : anchor.getParent()
  if (!$isParagraphNode(line) || !$isBlankLine(line)) return false
  const block = line.getParent()
  if (!$isTicketBlockNode(block) || block.getLastChild() !== line) return false

  const next = block.getNextSibling()
  const target =
    $isParagraphNode(next) && $isBlankLine(next) ? next : $createParagraphNode()
  if (target !== next) block.insertAfter(target)
  if (block.getChildrenSize() > 1) line.remove()
  target.select()
  return true
}

export const TicketBlockExtension = defineExtension({
  name: "@pp/ticket-block",
  nodes: [TicketBlockNode],
  register: (editor: LexicalEditor) =>
    mergeRegister(
      editor.registerNodeTransform(TicketBlockNode, (block) => {
        if ($isTicketBlockNode(block.getParent())) {
          $unwrap(block)
          return
        }
        if ($getRoot().getLastChild() === block) {
          block.insertAfter($createParagraphNode())
        }
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event !== null && event.shiftKey) return false
          if (!$exitTicketBlockFromEmptyLastLine()) return false
          event?.preventDefault()
          return true
        },
        COMMAND_PRIORITY_HIGH
      )
    )
})
