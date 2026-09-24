import { $isListItemNode, $isListNode, type ListNode } from "@lexical/list"
import { $isHeadingNode } from "@lexical/rich-text"
import {
  $getNearestBlockElementAncestorOrThrow,
  mergeRegister
} from "@lexical/utils"
import {
  HINT,
  activeHintSlots,
  alignedHintSlots,
  outlineBlockContent,
  stripHints,
  type BlockLookup,
  type BlockOutlineNode,
  type HintListKind,
  type HintSlot
} from "@pp/shared"
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  HISTORY_MERGE_TAG,
  KEY_TAB_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey
} from "lexical"

import { $isTicketBlockNode, TicketBlockNode } from "../TicketBlockNode"
import { $topLevelBlocks } from "./blockCommands"
import { slashTriggerMatch } from "./slashMenuItems"

export type ActiveHint = Readonly<{
  key: NodeKey
  hint: string
  empty: boolean
}>

type OutlineEntry = Readonly<{
  node: BlockOutlineNode
  keys: ReadonlyArray<NodeKey | null>
  texts: ReadonlyArray<string>
}>

const listKind = (list: ListNode): HintListKind => {
  switch (list.getListType()) {
    case "check":
      return "taskList"
    case "number":
      return "orderedList"
    default:
      return "bulletList"
  }
}

function $listEntry(list: ListNode): OutlineEntry {
  const keys: Array<NodeKey | null> = []
  const texts: Array<string> = []
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue
    if ($isListNode(item.getFirstChild()) && item.getChildrenSize() === 1) {
      if (texts.length > 0)
        texts[texts.length - 1] += `\n${item.getTextContent()}`
      continue
    }
    keys.push(item.getChecked() === true ? null : item.getKey())
    texts.push(item.getTextContent())
  }
  return { node: { kind: listKind(list), items: texts }, keys, texts }
}

function $outlineEntry(child: LexicalNode): OutlineEntry {
  const text = child.getTextContent()
  if ($isListNode(child)) return $listEntry(child)
  const kind = $isHeadingNode(child)
    ? "heading"
    : $isParagraphNode(child)
      ? "paragraph"
      : "other"
  return { node: { kind, text }, keys: [child.getKey()], texts: [text] }
}

function $hintAt(
  entries: ReadonlyArray<OutlineEntry>,
  slot: HintSlot
): ActiveHint | null {
  const entry = entries[slot.path[0]]
  if (entry === undefined) return null
  const index = slot.path.length === 2 ? slot.path[1] : 0
  const key = entry.keys[index]
  const text = entry.texts[index]
  if (key === undefined || key === null || text === undefined) return null
  const empty = text.trim() === ""
  const hint = empty || /\s$/.test(text) ? slot.hint : ` ${slot.hint}`
  return { key, hint, empty }
}

export function $blockHints(
  block: TicketBlockNode,
  lookup: BlockLookup
): ReadonlyArray<ActiveHint> {
  const definition = lookup(block.getBlockType())
  if (definition === undefined) return []
  const entries = block.getChildren().map($outlineEntry)
  return activeHintSlots(
    definition.content,
    entries.map((entry) => entry.node)
  ).flatMap((slot) => {
    const hint = $hintAt(entries, slot)
    return hint === null ? [] : [hint]
  })
}

export type HintSlotLine = Readonly<{ key: NodeKey; active: boolean }>

export function $blockSlotLines(
  block: TicketBlockNode,
  lookup: BlockLookup
): ReadonlyArray<HintSlotLine> {
  const definition = lookup(block.getBlockType())
  if (definition === undefined) return []
  const entries = block.getChildren().map($outlineEntry)
  const active = new Set($blockHints(block, lookup).map(({ key }) => key))
  return alignedHintSlots(
    definition.content,
    entries.map((entry) => entry.node)
  ).flatMap((slot) => {
    const entry = entries[slot.path[0]]
    const key = entry?.keys[slot.path.length === 2 ? slot.path[1] : 0]
    return key === undefined || key === null
      ? []
      : [{ key, active: active.has(key) }]
  })
}

export function $activeHints(lookup: BlockLookup): ReadonlyArray<ActiveHint> {
  return $topLevelBlocks()
    .filter($isTicketBlockNode)
    .flatMap((block) => $blockHints(block, lookup))
}

/**
 * True when the caret sits at the very end of a hinted element that holds only
 * its fixed prefix (`**Expected:**`), and that prefix has no trailing space.
 * Typing there would otherwise extend the bold prefix with no space between.
 */
function $atBarePrefixEnd(lookup: BlockLookup): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
  const anchor = selection.anchor.getNode()
  const block = anchor
    .getParents()
    .find((parent): parent is TicketBlockNode => $isTicketBlockNode(parent))
  if (block === undefined) return false
  return $blockHints(block, lookup).some(({ key, empty }) => {
    if (empty) return false
    const element = $getNodeByKey(key)
    if (!$isElementNode(element) || /\s$/.test(element.getTextContent()))
      return false
    const last = element.getLastDescendant()
    if ($isTextNode(last))
      return (
        last.is(anchor) && selection.anchor.offset === last.getTextContentSize()
      )
    return (
      element.is(anchor) &&
      selection.anchor.offset === element.getChildrenSize()
    )
  })
}

/**
 * Typing after a bare prefix starts plain text after a space, so
 * `**Expected:**` plus typing gives `**Expected:** it works`.
 */
function registerPrefixTyping(
  editor: LexicalEditor,
  lookup: BlockLookup
): () => void {
  return mergeRegister(
    // A plain selection format makes Lexical route the next keystroke through
    // CONTROLLED_TEXT_INSERTION_COMMAND instead of the native bold insertion.
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) && $atBarePrefixEnd(lookup)) {
          selection.format = 0
          selection.style = ""
        }
        return false
      },
      COMMAND_PRIORITY_LOW
    ),
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (payload) => {
        if (typeof payload !== "string" || /^\s/.test(payload)) return false
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !$atBarePrefixEnd(lookup))
          return false
        selection.format = 0
        selection.style = ""
        selection.insertText(` ${payload}`)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  )
}

const $lineEnd = (element: ElementNode): readonly [LexicalNode, number] => {
  const children = element.getChildren()
  const nested = children.findIndex($isListNode)
  const inline = nested === -1 ? children : children.slice(0, nested)
  const last = inline.at(-1)
  if ($isTextNode(last)) return [last, last.getTextContentSize()]
  return [element, inline.length]
}

const $isAtLineEnd = (element: ElementNode): boolean => {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return false
  const [node, offset] = $lineEnd(element)
  return (
    selection.anchor.getNode().is(node) && selection.anchor.offset === offset
  )
}

const $typeaheadBeforeCaret = (editor: LexicalEditor): boolean => {
  if (editor.getRootElement()?.hasAttribute("aria-controls") === true)
    return true
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return false
  const anchor = selection.anchor.getNode()
  return (
    $isTextNode(anchor) &&
    slashTriggerMatch(
      anchor.getTextContent().slice(0, selection.anchor.offset)
    ) !== null
  )
}

export function $hintTabTarget(
  lookup: BlockLookup,
  backwards: boolean
): NodeKey | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  const lines = $topLevelBlocks()
    .filter($isTicketBlockNode)
    .flatMap((block) => $blockSlotLines(block, lookup))
  if (lines.length < 2) return null
  const line = $getNearestBlockElementAncestorOrThrow(
    selection.anchor.getNode()
  )
  const index = lines.findIndex(({ key }) => key === line.getKey())
  const current = lines[index]
  if (current === undefined || (!current.active && !$isAtLineEnd(line)))
    return null
  const step = backwards ? -1 : 1
  return lines[(index + step + lines.length) % lines.length].key
}

export function $selectHintLine(key: NodeKey, lookup: BlockLookup) {
  const element = $getNodeByKey(key)
  if (!$isElementNode(element)) return
  const [node, offset] = $lineEnd(element)
  const selection = $isTextNode(node)
    ? node.select(offset, offset)
    : element.select(offset, offset)
  if ($atBarePrefixEnd(lookup)) {
    selection.format = 0
    selection.style = ""
  }
}

function registerHintTab(
  editor: LexicalEditor,
  lookup: BlockLookup
): () => void {
  return editor.registerCommand(
    KEY_TAB_COMMAND,
    (event) => {
      if ($typeaheadBeforeCaret(editor)) return false
      const target = $hintTabTarget(lookup, event.shiftKey)
      if (target === null) return false
      event.preventDefault()
      $addUpdateTag(HISTORY_MERGE_TAG)
      $selectHintLine(target, lookup)
      return true
    },
    COMMAND_PRIORITY_CRITICAL
  )
}

const isHintOnlyParagraph = (node: BlockOutlineNode): boolean =>
  node.kind === "paragraph" &&
  HINT.test(node.text) &&
  stripHints(node.text).trim() === ""

const matchesOutlineKind = (
  child: LexicalNode,
  node: BlockOutlineNode
): boolean => $outlineEntry(child).node.kind === node.kind

export function $restoreHintLines(block: TicketBlockNode, content: string) {
  const definition = outlineBlockContent(content)
  for (const [index, node] of definition.entries()) {
    const child = block.getChildAtIndex(index)
    if (child !== null && matchesOutlineKind(child, node)) continue
    if (!isHintOnlyParagraph(node)) return
    const next = definition[index + 1]
    if (
      child !== null &&
      (next === undefined || !matchesOutlineKind(child, next))
    )
      return
    const line = $createParagraphNode()
    if (child === null) block.append(line)
    else child.insertBefore(line)
  }
}

const HINT_ATTRIBUTE = "hint"
const EMPTY_ATTRIBUTE = "hintEmpty"

const clearHint = (element: HTMLElement) => {
  delete element.dataset[HINT_ATTRIBUTE]
  delete element.dataset[EMPTY_ATTRIBUTE]
}

function paintHints(
  editor: LexicalEditor,
  lookup: BlockLookup,
  painted: Map<NodeKey, HTMLElement>
) {
  const hints = editor.getEditorState().read(() => $activeHints(lookup))
  const next = new Map<NodeKey, HTMLElement>()
  for (const { key, hint, empty } of hints) {
    const element = editor.getElementByKey(key)
    if (element === null) continue
    if (element.dataset[HINT_ATTRIBUTE] !== hint)
      element.dataset[HINT_ATTRIBUTE] = hint
    if (empty) element.dataset[EMPTY_ATTRIBUTE] = ""
    else delete element.dataset[EMPTY_ATTRIBUTE]
    next.set(key, element)
  }
  for (const [key, element] of painted)
    if (next.get(key) !== element) clearHint(element)
  painted.clear()
  for (const [key, element] of next) painted.set(key, element)
}

function restoreCreatedBlocks(
  editor: LexicalEditor,
  lookup: BlockLookup,
  keys: ReadonlyArray<NodeKey>
) {
  editor.update(
    () => {
      for (const key of keys) {
        const block = $getNodeByKey(key)
        if (!$isTicketBlockNode(block) || !block.isAttached()) continue
        const definition = lookup(block.getBlockType())
        if (definition !== undefined)
          $restoreHintLines(block, definition.content)
      }
    },
    { tag: HISTORY_MERGE_TAG }
  )
}

export function registerBlockHints(
  editor: LexicalEditor,
  lookup: BlockLookup
): () => void {
  const painted = new Map<NodeKey, HTMLElement>()
  const unregister = mergeRegister(
    editor.registerMutationListener(
      TicketBlockNode,
      (mutations) => {
        const created = [...mutations].flatMap(([key, mutation]) =>
          mutation === "created" ? [key] : []
        )
        if (created.length > 0) restoreCreatedBlocks(editor, lookup, created)
      },
      { skipInitialization: false }
    ),
    editor.registerUpdateListener(() => paintHints(editor, lookup, painted)),
    registerPrefixTyping(editor, lookup),
    registerHintTab(editor, lookup)
  )
  paintHints(editor, lookup, painted)
  return () => {
    unregister()
    for (const element of painted.values()) clearHint(element)
    painted.clear()
  }
}
