import { $isListNode } from "@lexical/list"
import { $convertFromMarkdownString, type Transformer } from "@lexical/markdown"
import { $isHeadingNode } from "@lexical/rich-text"
import { $findMatchingParent } from "@lexical/utils"
import {
  HINT,
  hintSlots,
  outlineBlockContent,
  stripHints,
  type BlockLookup,
  type HintNodeKind,
  type HintSlot
} from "@pp/shared"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection
} from "lexical"

import { $isTicketBlockNode, type TicketBlockNode } from "../TicketBlockNode"
import { $isSyncedBlockNode, type SyncedBlockNode } from "./SyncedBlockNode"
import { $detachSyncedBlock } from "./syncedBlocks"

export type TopLevelBlockNode = TicketBlockNode | SyncedBlockNode

export const $isTopLevelBlockNode = (
  node: LexicalNode | null | undefined
): node is TopLevelBlockNode =>
  $isTicketBlockNode(node) || $isSyncedBlockNode(node)

export function $topLevelBlocks(): ReadonlyArray<TopLevelBlockNode> {
  return $getRoot().getChildren().filter($isTopLevelBlockNode)
}

export function $findBlockAtSelection(): TopLevelBlockNode | null {
  const selection = $getSelection()
  const node = $isRangeSelection(selection)
    ? selection.anchor.getNode()
    : selection?.getNodes()[0]
  if (node === undefined) return null
  const block = $findMatchingParent(
    node,
    (candidate) =>
      $isTopLevelBlockNode(candidate) && candidate.getParent() === $getRoot()
  )
  return $isTopLevelBlockNode(block) ? block : null
}

const $isBlankParagraph = (node: LexicalNode): boolean =>
  $isParagraphNode(node) &&
  node.getChildren().every($isTextNode) &&
  node.getTextContent().trim() === ""

const $topLevelOf = (node: LexicalNode): LexicalNode | null =>
  $isRootNode(node)
    ? null
    : $findMatchingParent(node, (candidate) =>
        $isRootNode(candidate.getParent())
      )

type InsertionPoint = Readonly<{
  after: LexicalNode
  leftovers: ReadonlyArray<LexicalNode>
}>

function $appendLine(): InsertionPoint {
  const line = $createParagraphNode()
  $getRoot().append(line)
  return { after: line, leftovers: [line] }
}

function $splitAtCaret(selection: RangeSelection): InsertionPoint {
  const anchor = selection.anchor.getNode()
  const top = $topLevelOf(anchor)
  if (top === null) return $appendLine()
  const line = $isParagraphNode(anchor) ? anchor : anchor.getParent()
  if (!$isParagraphNode(top) || line !== top)
    return { after: top, leftovers: [] }
  const right = selection.insertParagraph()
  return { after: top, leftovers: right === null ? [top] : [top, right] }
}

function $insertionPoint(): InsertionPoint | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const block = $findBlockAtSelection()
  return block === null
    ? $splitAtCaret(selection)
    : { after: block, leftovers: [] }
}

type ImportedMarkdown = Readonly<{
  container: ElementNode
  nodes: ReadonlyArray<LexicalNode>
}>

function $markdownNodes(
  markdown: string,
  transformers: ReadonlyArray<Transformer>
): ImportedMarkdown {
  const selection = $getSelection()
  const saved = selection === null ? null : selection.clone()
  const container = $createParagraphNode()
  $getRoot().append(container)
  try {
    $convertFromMarkdownString(markdown, [...transformers], container)
  } finally {
    $setSelection(saved)
  }
  return { container, nodes: container.getChildren() }
}

const isHintOnlyParagraph = (text: string): boolean =>
  HINT.test(text) && stripHints(text).trim() === ""

function $materializeHintLines(block: TicketBlockNode, content: string) {
  outlineBlockContent(content).forEach((node, index) => {
    if (node.kind !== "paragraph" || !isHintOnlyParagraph(node.text)) return
    const child = block.getChildAtIndex(index)
    if ($isParagraphNode(child)) return
    const line = $createParagraphNode()
    if (child === null) block.append(line)
    else child.insertBefore(line)
  })
}

const matchesHintKind = (node: LexicalNode, kind: HintNodeKind): boolean => {
  switch (kind) {
    case "heading":
      return $isHeadingNode(node)
    case "paragraph":
      return $isParagraphNode(node)
    case "other":
      return false
    default:
      return $isListNode(node)
  }
}

function $hintTarget(
  block: TicketBlockNode,
  slot: HintSlot
): ElementNode | null {
  const child = block.getChildAtIndex(slot.path[0])
  if (child === null || !matchesHintKind(child, slot.kind)) return null
  const target =
    slot.path.length === 2 && $isListNode(child)
      ? child.getChildAtIndex(slot.path[1])
      : child
  return $isElementNode(target) ? target : null
}

function $firstHintTarget(
  block: TicketBlockNode,
  lookup: BlockLookup
): ElementNode | null {
  const definition = lookup(block.getBlockType())
  if (definition === undefined) return null
  for (const slot of hintSlots(definition.content)) {
    const target = $hintTarget(block, slot)
    if (target !== null) return target
  }
  return null
}

function $placeCaretAfterInsert(
  nodes: ReadonlyArray<LexicalNode>,
  lookup: BlockLookup
) {
  const blocks = nodes.filter($isTicketBlockNode)
  for (const block of blocks) {
    const definition = lookup(block.getBlockType())
    if (definition !== undefined)
      $materializeHintLines(block, definition.content)
  }
  for (const block of blocks) {
    const target = $firstHintTarget(block, lookup)
    if (target !== null) {
      target.selectEnd()
      return
    }
  }
  const last = nodes.at(-1)
  if (last === undefined) return
  if ($isElementNode(last)) {
    last.selectEnd()
    return
  }
  const next = last.getNextSibling()
  if ($isElementNode(next)) {
    next.selectStart()
    return
  }
  const line = $createParagraphNode()
  last.insertAfter(line)
  line.select()
}

export function $insertBlocksAt(
  markdown: string,
  transformers: ReadonlyArray<Transformer>,
  lookup: BlockLookup
): ReadonlyArray<LexicalNode> {
  const point = $insertionPoint()
  if (point === null) return []
  const { container, nodes } = $markdownNodes(markdown, transformers)
  let previous = point.after
  for (const node of nodes) {
    previous.insertAfter(node)
    previous = node
  }
  container.remove()
  for (const leftover of point.leftovers)
    if (leftover.isAttached() && $isBlankParagraph(leftover)) leftover.remove()
  $placeCaretAfterInsert(nodes, lookup)
  return nodes
}

export function $unwrapBlock(
  node: TopLevelBlockNode,
  content: string,
  transformers: ReadonlyArray<Transformer>
): ReadonlyArray<LexicalNode> {
  const block = $isSyncedBlockNode(node)
    ? $detachSyncedBlock(node, content, transformers)
    : node
  const children = block.getChildren()
  for (const child of children) block.insertBefore(child)
  block.remove()
  return children
}
