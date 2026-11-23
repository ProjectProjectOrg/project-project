import { $isCodeNode } from "@lexical/code-core"
import { $isLinkNode } from "@lexical/link"
import { $isListNode, ListNode } from "@lexical/list"
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text"
import { $getNearestNodeOfType } from "@lexical/utils"
import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type RangeSelection,
  type TextFormatType
} from "lexical"

import {
  Bold,
  Code,
  Italic,
  Strikethrough,
  type IconType
} from "../components/icons"
import { type BasicBlockKind } from "./basic-blocks"

// What the formatting toolbar shows: the selection's formats, link and block type, and where it sits.

export type BlockKind =
  | "heading"
  | "bullet-list"
  | "numbered-list"
  | "checklist"
  | "quote"
  | "code"

export type TextFormat = "bold" | "italic" | "strikethrough" | "code"

export const TEXT_FORMATS: ReadonlyArray<
  Readonly<{ format: TextFormat & TextFormatType; icon: IconType }>
> = [
  { format: "bold", icon: Bold },
  { format: "italic", icon: Italic },
  { format: "strikethrough", icon: Strikethrough },
  { format: "code", icon: Code }
]

export const BLOCK_KINDS: ReadonlyArray<BlockKind> = [
  "heading",
  "bullet-list",
  "numbered-list",
  "checklist",
  "quote",
  "code"
]

export const LIST_KINDS = {
  bullet: "bullet-list",
  number: "numbered-list",
  check: "checklist"
} as const satisfies Record<ReturnType<ListNode["getListType"]>, BasicBlockKind>

export const LIST_BLOCKS: ReadonlySet<BasicBlockKind> = new Set(
  Object.values(LIST_KINDS)
)

export const STARTS_WITH_HOSTNAME = /^[a-z\d-]+(\.[a-z\d-]+)+(:\d+)?([/?#]|$)/i

export const withHttps = (url: string) =>
  STARTS_WITH_HOSTNAME.test(url) && !/\s/.test(url) ? `https://${url}` : url

export type ToolbarAlign = "start" | "center"

export type SelectionAnchor = Readonly<{ rect: DOMRect; align: ToolbarAlign }>

export type Toolbar = SelectionAnchor &
  Readonly<{
    formats: ReadonlySet<TextFormatType>
    link: boolean
    block: BasicBlockKind | null
  }>

export function $blockOf(selection: RangeSelection) {
  const anchor = selection.anchor.getNode()
  const list = $getNearestNodeOfType(anchor, ListNode)
  if ($isListNode(list)) return LIST_KINDS[list.getListType()]
  const top = anchor.getTopLevelElement()
  if ($isHeadingNode(top))
    return (
      {
        h1: "heading-1",
        h2: "heading",
        h3: "heading-3",
        h4: "heading-4",
        h5: "heading-5",
        h6: "heading-6"
      } satisfies Readonly<Record<string, BasicBlockKind>>
    )[top.getTag()]
  if ($isQuoteNode(top)) return "quote"
  if ($isCodeNode(top)) return "code"
  return null
}

export type ToolbarState = Omit<Toolbar, keyof SelectionAnchor>

export const selectionAnchor = (range: Range) => {
  const lines = [...range.getClientRects()].filter((line) => line.width > 0)
  const [first] = lines
  const multiline =
    first !== undefined &&
    lines.some((line) => line.top > first.top + first.height / 2)
  return multiline
    ? ({ rect: first, align: "start" } satisfies SelectionAnchor)
    : ({
        rect: range.getBoundingClientRect(),
        align: "center"
      } satisfies SelectionAnchor)
}

export function readState(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return null
    if (selection.getTextContent().trim() === "") return null
    const parent = selection.anchor.getNode().getParent()
    return {
      formats: new Set(
        TEXT_FORMATS.flatMap(({ format }) =>
          selection.hasFormat(format) ? [format] : []
        )
      ),
      link: $isLinkNode(parent),
      block: $blockOf(selection)
    } satisfies ToolbarState
  })
}

export function readToolbar(editor: LexicalEditor, focused: Toolbar | null) {
  if (focused !== null) {
    const state = readState(editor)
    return state === null ? focused : { ...focused, ...state }
  }
  const root = editor.getRootElement()
  const native = window.getSelection()
  if (root === null || native === null || native.rangeCount === 0) return null
  if (!root.contains(native.anchorNode)) return null
  if (!root.contains(document.activeElement)) return null
  const state = readState(editor)
  if (state === null) return null
  return { ...selectionAnchor(native.getRangeAt(0)), ...state }
}

export const TOOLBAR_SHORTCUT = "Alt+F10"

export const isToolbarShortcut = (event: globalThis.KeyboardEvent) =>
  event.altKey && event.key === "F10"
