import { CodeNode } from "@lexical/code"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { HeadingNode } from "@lexical/rich-text"
import {
  $createLineBreakNode,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  type LexicalNode
} from "lexical"
import { describe, expect, it } from "vitest"

import { MARKDOWN_TRANSFORMERS } from "../LexicalEditor"
import { $exitTicketBlockFromEmptyLastLine } from "./TicketBlockExtension"
import { $isTicketBlockNode, TicketBlockNode } from "./TicketBlockNode"

const BLOCK = '<block type="notes">\n\n## Notes\n\n</block>'

function pressEnterOnEmptyLastLine(
  markdown: string,
  prepare: (block: TicketBlockNode) => LexicalNode
) {
  const editor = createEditor({
    namespace: "ticket-block-test",
    nodes: [CodeNode, HeadingNode, ListNode, ListItemNode, TicketBlockNode],
    onError: (error) => {
      throw error
    }
  })
  let handled = false
  let exported = ""
  let caretOutsideBlock = false
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS)
      const block = $getRoot().getChildren().find($isTicketBlockNode)
      if (!block) throw new Error("no block imported")
      prepare(block).selectStart()
      handled = $exitTicketBlockFromEmptyLastLine()
      const selection = $getSelection()
      caretOutsideBlock =
        $isRangeSelection(selection) &&
        !selection.anchor
          .getNode()
          .getParents()
          .some((parent) => $isTicketBlockNode(parent))
      exported = $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
    },
    { discrete: true }
  )
  return { handled, exported, caretOutsideBlock }
}

const appendEmptyLine = (block: TicketBlockNode) => {
  const line = $createParagraphNode()
  block.append(line)
  return line
}

describe("$exitTicketBlockFromEmptyLastLine", () => {
  it("leaves Enter alone on a last line that only holds a line break", () => {
    const result = pressEnterOnEmptyLastLine(BLOCK, (block) => {
      const line = appendEmptyLine(block)
      line.append($createLineBreakNode())
      return line
    })

    expect(result.handled).toBe(false)
  })

  it("drops the empty last line and moves the caret below the block", () => {
    const result = pressEnterOnEmptyLastLine(BLOCK, appendEmptyLine)

    expect(result.handled).toBe(true)
    expect(result.caretOutsideBlock).toBe(true)
    expect(result.exported.trimEnd()).toBe(BLOCK)
  })

  it("reuses an empty paragraph that already sits below the block", () => {
    const result = pressEnterOnEmptyLastLine(BLOCK, (block) => {
      block.insertAfter($createParagraphNode())
      return appendEmptyLine(block)
    })

    expect(result.handled).toBe(true)
    expect(result.exported.trimEnd()).toBe(BLOCK)
  })

  it("keeps the only line of an empty block so the block survives", () => {
    const result = pressEnterOnEmptyLastLine(
      '<block type="notes">\n\n</block>',
      (block) => block.getFirstChildOrThrow()
    )

    expect(result.handled).toBe(true)
    expect(result.caretOutsideBlock).toBe(true)
    expect(result.exported.trimEnd()).toBe('<block type="notes">\n\n</block>')
  })

  it("leaves Enter alone on a line that has text", () => {
    const result = pressEnterOnEmptyLastLine(
      '<block type="notes">\n\nSome text\n\n</block>',
      (block) => block.getLastChildOrThrow()
    )

    expect(result.handled).toBe(false)
  })

  it("leaves Enter alone on an empty line that is not the last one", () => {
    const result = pressEnterOnEmptyLastLine(BLOCK, (block) => {
      const line = $createParagraphNode()
      block.getFirstChildOrThrow().insertBefore(line)
      return line
    })

    expect(result.handled).toBe(false)
  })
})
