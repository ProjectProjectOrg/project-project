import { $createCodeNode } from "@lexical/code"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND
} from "@lexical/list"
import {
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode
} from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import { INSERT_TABLE_COMMAND } from "@lexical/table"
import {
  $copyNode,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor
} from "lexical"

import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  SquareCode,
  Table2,
  TextCursorInput,
  TextQuote,
  type IconType
} from "../components/icons"
import { $createHintNode } from "./hint-node"

/*
 * The editor's basic blocks: the Markdown block types the slash menu and
 * the formatting toolbar both offer, their icons, and how to turn the
 * selection into one.
 */

export type BasicBlockKind =
  | "paragraph"
  | "heading-1"
  | "heading"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "checklist"
  | "bullet-list"
  | "numbered-list"
  | "code"
  | "quote"
  | "divider"
  | "table"
  // A template's {{hint}} placeholder (block definitions only).
  | "hint"

// Every basic block a document can hold, in menu order (not the hint).
export const BASIC_BLOCK_KINDS: ReadonlyArray<BasicBlockKind> = [
  "paragraph",
  "heading-1",
  "heading",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "checklist",
  "bullet-list",
  "numbered-list",
  "code",
  "quote",
  "divider",
  "table"
]

export const BASIC_BLOCK_ICONS: Readonly<Record<BasicBlockKind, IconType>> = {
  paragraph: Pilcrow,
  "heading-1": Heading1,
  heading: Heading2,
  "heading-3": Heading3,
  "heading-4": Heading4,
  "heading-5": Heading5,
  "heading-6": Heading6,
  checklist: ListTodo,
  "bullet-list": List,
  "numbered-list": ListOrdered,
  code: SquareCode,
  quote: TextQuote,
  divider: Minus,
  table: Table2,
  hint: TextCursorInput
}

const HEADING_TAGS = {
  "heading-1": "h1",
  heading: "h2",
  "heading-3": "h3",
  "heading-4": "h4",
  "heading-5": "h5",
  "heading-6": "h6"
} as const satisfies Readonly<
  Record<string, Parameters<typeof $createHeadingNode>[0]>
>

// Back to plain paragraphs, lifted out of any quote around them.
function $toParagraphs() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const paragraphs: ReturnType<typeof $createParagraphNode>[] = []
  $setBlocksType(selection, () => {
    const paragraph = $createParagraphNode()
    paragraphs.push(paragraph)
    return paragraph
  })
  for (const paragraph of paragraphs) {
    paragraph.setIndent(0)
    let parent = paragraph.getParent()
    while ($isQuoteNode(parent)) {
      const after = paragraph.getNextSiblings()
      if (after.length > 0)
        parent.insertAfter($copyNode(parent).append(...after))
      parent.insertAfter(paragraph)
      if (parent.isEmpty()) parent.remove()
      parent = paragraph.getParent()
    }
  }
}

// A {{hint}} with its words selected, so typing replaces them.
function $insertHint(text: string) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const hint = $createHintNode(`{{${text}}}`)
  selection.insertNodes([hint])
  hint.select(2, text.length + 2)
}

// Turns the selection into `kind` (or inserts it: a divider, a table, a
// hint). `hintText` is the hint's placeholder words.
export function $insertBasicBlock(
  editor: LexicalEditor,
  kind: BasicBlockKind,
  hintText = ""
) {
  const selection = $getSelection()
  switch (kind) {
    case "paragraph":
      $toParagraphs()
      return
    case "heading-1":
    case "heading":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createHeadingNode(HEADING_TAGS[kind]))
      return
    case "quote":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createQuoteNode())
      return
    case "code":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createCodeNode())
      return
    case "checklist":
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      return
    case "bullet-list":
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      return
    case "numbered-list":
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      return
    case "divider":
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
      return
    case "table":
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        columns: "3",
        rows: "3",
        includeHeaders: { rows: true, columns: false }
      })
      return
    case "hint":
      $insertHint(hintText)
  }
}
