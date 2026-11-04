import { $convertFromMarkdownString, type Transformer } from "@lexical/markdown"
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode
} from "lexical"

import { $ensureTrailingLine } from "./descriptionTemplates"

/** Where the caret sits, as text in a block that survives a re-import. */
type Caret = Readonly<{ index: number; text: string; offset: number }>

const isTextBlock = (node: LexicalNode): node is ElementNode =>
  $isElementNode(node) &&
  !node.isInline() &&
  !node
    .getChildren()
    .some((child) => $isElementNode(child) && !child.isInline())

function $textBlocks(): Array<ElementNode> {
  const blocks: Array<ElementNode> = []
  const visit = (node: LexicalNode) => {
    if (isTextBlock(node)) blocks.push(node)
    else if ($isElementNode(node)) node.getChildren().forEach(visit)
  }
  $getRoot().getChildren().forEach(visit)
  return blocks
}

const blockText = (block: ElementNode): string =>
  block
    .getAllTextNodes()
    .map((node) => node.getTextContent())
    .join("")

function $readCaret(): Caret | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  const anchor = selection.anchor.getNode()
  const blocks = $textBlocks()
  const index = blocks.findIndex(
    (block) => block.is(anchor) || block.isParentOf(anchor)
  )
  const block = blocks[index]
  if (block === undefined) return null

  const texts = block.getAllTextNodes()
  let offset = 0
  if ($isTextNode(anchor)) {
    for (const node of texts) {
      if (node.is(anchor)) break
      offset += node.getTextContentSize()
    }
    offset += selection.anchor.offset
  } else {
    const before = new Set(
      block
        .getChildren()
        .slice(0, selection.anchor.offset)
        .flatMap((child) =>
          $isElementNode(child) ? child.getAllTextNodes() : [child]
        )
    )
    offset = texts
      .filter((node) => before.has(node))
      .reduce((sum, node) => sum + node.getTextContentSize(), 0)
  }
  return { index, text: blockText(block), offset }
}

function $placeCaret(caret: Caret) {
  const blocks = $textBlocks()
  const matches = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => blockText(block) === caret.text)
    .toSorted(
      (a, b) =>
        Math.abs(a.index - caret.index) - Math.abs(b.index - caret.index)
    )
  const block =
    matches[0]?.block ??
    blocks[Math.min(caret.index, blocks.length - 1)] ??
    null
  if (block === null) {
    $setSelection(null)
    return
  }

  let remaining = Math.min(caret.offset, blockText(block).length)
  for (const node of block.getAllTextNodes()) {
    const size = node.getTextContentSize()
    if (remaining <= size) {
      node.select(remaining, remaining)
      return
    }
    remaining -= size
  }
  block.selectEnd()
}

/**
 * Replaces the editor's content with a merged description, keeping the caret
 * in the block it was in. The undo history is cleared afterwards: undoing past
 * the merge would quietly drop the other person's change on the next save.
 */
export function mergeIntoEditor(
  editor: LexicalEditor,
  markdown: string,
  transformers: ReadonlyArray<Transformer>
) {
  editor.update(
    () => {
      const caret = $readCaret()
      $convertFromMarkdownString(markdown, [...transformers])
      $ensureTrailingLine()
      if (caret === null) $setSelection(null)
      else $placeCaret(caret)
    },
    {
      discrete: true,
      onUpdate: () => editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
    }
  )
}
