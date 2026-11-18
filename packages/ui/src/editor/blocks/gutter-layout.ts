import { type LexicalEditor, type NodeKey } from "lexical"

import { $topLevelBlocks } from "./block-commands"
import {
  INSET_RAIL_LEFT,
  layoutTop,
  measureRailBounds,
  RAIL_SIZE,
  railHost,
  railLeft
} from "./block-rail"
import { $isTicketBlockNode } from "./ticket-block-node"

// Where the gutter's handles go: each block's first line, the rail, and which block is under the pointer.

export type GutterItem = Readonly<{
  key: NodeKey
  blockType: string
  synced: boolean
  top: number
  blockTop: number
  right: number
}>

export const firstLineOffset = (block: HTMLElement): number => {
  const line =
    block.firstElementChild instanceof HTMLElement
      ? block.firstElementChild
      : block
  const top =
    line === block
      ? 0
      : line.offsetParent === block
        ? line.offsetTop
        : line.getBoundingClientRect().top - block.getBoundingClientRect().top
  const lineHeight = Number.parseFloat(getComputedStyle(line).lineHeight)
  const box = Number.isFinite(lineHeight)
    ? lineHeight
    : line.getBoundingClientRect().height
  return top + (box - RAIL_SIZE) / 2
}

export const measureItems = (
  editor: LexicalEditor,
  anchor: HTMLElement
): ReadonlyArray<GutterItem> => {
  const anchorRight = anchor.getBoundingClientRect().right
  return editor.getEditorState().read(() =>
    $topLevelBlocks().flatMap((node) => {
      const element = editor.getElementByKey(node.getKey())
      if (element === null) return []
      const blockTop = layoutTop(element, anchor)
      return [
        {
          key: node.getKey(),
          blockType: node.getBlockType(),
          synced: !$isTicketBlockNode(node),
          top: blockTop + firstLineOffset(element),
          blockTop,
          right: anchorRight - element.getBoundingClientRect().right
        }
      ]
    })
  )
}

export const sameItems = (
  a: ReadonlyArray<GutterItem>,
  b: ReadonlyArray<GutterItem>
): boolean =>
  a.length === b.length &&
  a.every(
    (item, index) =>
      item.key === b[index].key &&
      item.blockType === b[index].blockType &&
      Math.abs(item.top - b[index].top) < 0.5 &&
      Math.abs(item.right - b[index].right) < 0.5
  )

export const blockAtY = (
  editor: LexicalEditor,
  items: ReadonlyArray<GutterItem>,
  y: number
): NodeKey | null =>
  items.find((item) => {
    const rect = editor.getElementByKey(item.key)?.getBoundingClientRect()
    return rect !== undefined && y >= rect.top && y <= rect.bottom
  })?.key ?? null

export const focusedWithin = (editor: LexicalEditor): HTMLElement | null => {
  const active = document.activeElement
  const area = editor.getRootElement()?.parentElement
  return active instanceof HTMLElement && area?.contains(active) === true
    ? active
    : null
}

export const measureRail = (anchor: HTMLElement): number | null => {
  const host = railHost(anchor)
  return host.hasAttribute("data-block-rail-inset")
    ? INSET_RAIL_LEFT
    : railLeft(measureRailBounds(anchor, host))
}

export const flash = (element: HTMLElement, order: number) => {
  element.style.setProperty("--flash-order", String(order))
  element.dataset.flash = ""
  const settle = (event: AnimationEvent) => {
    if (event.animationName !== "ticket-block-flash") return
    element.removeEventListener("animationend", settle)
    delete element.dataset.flash
    element.style.removeProperty("--flash-order")
  }
  element.addEventListener("animationend", settle)
}

export type Created = Readonly<{ key: NodeKey; element: HTMLElement }>

export const inDocumentOrder = (
  created: ReadonlyArray<Created>
): ReadonlyArray<Created> =>
  created.toSorted((a, b) =>
    a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  )
