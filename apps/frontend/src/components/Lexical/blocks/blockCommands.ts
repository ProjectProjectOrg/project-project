import { $isListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type Transformer
} from "@lexical/markdown"
import { $isHeadingNode } from "@lexical/rich-text"
import { $findMatchingParent } from "@lexical/utils"
import {
  HINT,
  hintSlots,
  outlineBlockContent,
  stripHints,
  type BlockDefinition,
  type BlockLookup,
  type HintNodeKind,
  type HintSlot
} from "@pp/shared"
import {
  $copyNode,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  createCommand,
  type ElementNode,
  type LexicalCommand,
  type LexicalNode,
  type NodeKey,
  type RangeSelection
} from "lexical"

import { blankBlockHeading } from "@/components/blocks/blockChrome"

import { $isTicketBlockNode, type TicketBlockNode } from "../TicketBlockNode"
import { $isSyncedBlockNode, type SyncedBlockNode } from "./SyncedBlockNode"
import { $detachSyncedBlock } from "./syncedBlocks"

export const OPEN_BLOCK_MENU_COMMAND: LexicalCommand<NodeKey> = createCommand(
  "OPEN_BLOCK_MENU_COMMAND"
)

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

export type BlockDirection = "up" | "down"

export type BlockPlacement = "before" | "after"

export const $blockNeighbour = (
  node: LexicalNode,
  direction: BlockDirection
): LexicalNode | null => {
  let candidate =
    direction === "up" ? node.getPreviousSibling() : node.getNextSibling()
  while (candidate !== null && $isBlankParagraph(candidate))
    candidate =
      direction === "up"
        ? candidate.getPreviousSibling()
        : candidate.getNextSibling()
  return candidate
}

export function $moveBlock(
  node: TopLevelBlockNode,
  direction: BlockDirection
): LexicalNode | null {
  const neighbour = $blockNeighbour(node, direction)
  if (neighbour === null) return null
  if (direction === "up") neighbour.insertBefore(node)
  else neighbour.insertAfter(node)
  return neighbour
}

export function $moveBlockTo(
  node: TopLevelBlockNode,
  target: LexicalNode,
  placement: BlockPlacement
): boolean {
  if (target.is(node)) return false
  const adjacent =
    placement === "before"
      ? target.getPreviousSibling()
      : target.getNextSibling()
  if (adjacent !== null && adjacent.is(node)) return false
  if (placement === "before") target.insertBefore(node)
  else target.insertAfter(node)
  return true
}

function $deepCopy<T extends LexicalNode>(node: T): T {
  const copy = $copyNode(node)
  if ($isElementNode(node) && $isElementNode(copy))
    copy.append(...node.getChildren().map($deepCopy))
  return copy
}

export function $duplicateBlock(node: TopLevelBlockNode): TopLevelBlockNode {
  const copy = $deepCopy(node)
  node.insertAfter(copy)
  return copy
}

function $moveCaretAway(node: LexicalNode) {
  const previous = node.getPreviousSibling()
  const next = node.getNextSibling()
  if ($isElementNode(previous)) previous.selectEnd()
  else if ($isElementNode(next)) next.selectStart()
  else if (previous !== null) previous.selectNext()
  else if (next !== null) next.selectPrevious()
}

export function $removeBlock(node: TopLevelBlockNode) {
  $moveCaretAway(node)
  const root = $getRoot()
  node.remove()
  if (root.isEmpty()) {
    const line = $createParagraphNode()
    root.append(line)
    line.select()
  }
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

export function $blockMarkdown(
  node: TicketBlockNode,
  transformers: ReadonlyArray<Transformer>
): string {
  return $convertToMarkdownString([...transformers], node)
}

export function $resetBlock(
  node: TicketBlockNode,
  definition: BlockDefinition,
  transformers: ReadonlyArray<Transformer>
) {
  $convertFromMarkdownString(
    stripHints(definition.content),
    [...transformers],
    node
  )
  if (node.isEmpty()) node.append($createParagraphNode())
  $materializeHintLines(node, definition.content)
  const target = hintSlots(definition.content)
    .map((slot) => $hintTarget(node, slot))
    .find((candidate) => candidate !== null)
  if (target !== undefined && target !== null) target.selectEnd()
  else node.selectEnd()
}

const $isAtBlockStart = (
  block: TicketBlockNode,
  selection: RangeSelection
): boolean => {
  if (!selection.isCollapsed() || selection.anchor.offset !== 0) return false
  const first = block.getFirstChild()
  if (first === null) return false
  const anchor = selection.anchor.getNode()
  return (
    anchor.is(first) ||
    ($isElementNode(first) && anchor.is(first.getFirstDescendant()))
  )
}

export function $blankBlockAtCaret(
  transformers: ReadonlyArray<Transformer>
): TicketBlockNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const block = $findBlockAtSelection()
  if (!$isTicketBlockNode(block) || !$isAtBlockStart(block, selection))
    return null
  return blankBlockHeading($blockMarkdown(block, transformers)) === null
    ? null
    : block
}
