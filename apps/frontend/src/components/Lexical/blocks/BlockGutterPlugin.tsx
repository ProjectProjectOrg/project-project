import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import type { LexicalEditor, NodeKey } from "lexical"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

import { lookupFor } from "@/components/blocks/blockChrome"
import { TooltipProvider } from "@/components/ui/tooltip"

import { TicketBlockNode } from "../TicketBlockNode"
import { $findBlockAtSelection, $topLevelBlocks } from "./blockCommands"
import {
  layoutTop,
  measureRailBounds,
  RAIL_SIZE,
  railHost,
  railLeft
} from "./blockRail"
import type { EditorBlocks } from "./editorBlocks"
import { GutterButton } from "./GutterButton"
import { SyncedBlockNode } from "./SyncedBlockNode"

type GutterItem = Readonly<{
  key: NodeKey
  blockType: string
  top: number
}>

const firstLineOffset = (block: HTMLElement): number => {
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

const measureItems = (
  editor: LexicalEditor,
  anchor: HTMLElement
): ReadonlyArray<GutterItem> =>
  editor.getEditorState().read(() =>
    $topLevelBlocks().flatMap((node) => {
      const element = editor.getElementByKey(node.getKey())
      if (element === null) return []
      return [
        {
          key: node.getKey(),
          blockType: node.getBlockType(),
          top: layoutTop(element, anchor) + firstLineOffset(element)
        }
      ]
    })
  )

const sameItems = (
  a: ReadonlyArray<GutterItem>,
  b: ReadonlyArray<GutterItem>
): boolean =>
  a.length === b.length &&
  a.every(
    (item, index) =>
      item.key === b[index].key &&
      item.blockType === b[index].blockType &&
      Math.abs(item.top - b[index].top) < 0.5
  )

const blockAtY = (
  editor: LexicalEditor,
  items: ReadonlyArray<GutterItem>,
  y: number
): NodeKey | null =>
  items.find((item) => {
    const rect = editor.getElementByKey(item.key)?.getBoundingClientRect()
    return rect !== undefined && y >= rect.top && y <= rect.bottom
  })?.key ?? null

const measureRail = (anchor: HTMLElement): number | null =>
  railLeft(measureRailBounds(anchor, railHost(anchor)))

const flash = (element: HTMLElement, order: number) => {
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

type Created = Readonly<{ key: NodeKey; element: HTMLElement }>

const LANDING_MS = 1500
const NO_LANDING: ReadonlyMap<NodeKey, number> = new Map()

const inDocumentOrder = (
  created: ReadonlyArray<Created>
): ReadonlyArray<Created> =>
  created.toSorted((a, b) =>
    a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  )

export function BlockGutterPlugin({
  blocks
}: Readonly<{
  blocks: Pick<EditorBlocks, "library">
}>) {
  const [editor] = useLexicalComposerContext()
  const { library } = blocks
  const lookup = useMemo(() => lookupFor(library), [library])
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [items, setItems] = useState<ReadonlyArray<GutterItem>>([])
  const [landing, setLanding] =
    useState<ReadonlyMap<NodeKey, number>>(NO_LANDING)
  const [rail, setRail] = useState<number | null>(null)
  const [hovered, setHovered] = useState<NodeKey | null>(null)
  const [active, setActive] = useState<NodeKey | null>(null)
  const [editorFocused, setEditorFocused] = useState(false)

  useEffect(
    () =>
      editor.registerRootListener((root) => {
        setAnchor(root?.parentElement ?? null)
      }),
    [editor]
  )

  useEffect(() => {
    if (anchor === null) return
    let frame = 0
    const measure = () => {
      const next = measureItems(editor, anchor)
      setItems((current) => (sameItems(current, next) ? current : next))
      setRail(measureRail(anchor))
    }
    const schedule = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    let pending: Array<Created> = []
    let landed = 0
    const flashPending = () => {
      const ordered = inDocumentOrder(pending)
      pending = []
      ordered.forEach(({ element }, order) => flash(element, order))
      setLanding(new Map(ordered.map(({ key }, order) => [key, order])))
      window.clearTimeout(landed)
      landed = window.setTimeout(() => setLanding(NO_LANDING), LANDING_MS)
    }
    const flashCreated = (mutations: Map<NodeKey, string>) => {
      const queued = pending.length > 0
      for (const [key, mutation] of mutations) {
        const element = editor.getElementByKey(key)
        if (mutation === "created" && element !== null)
          pending.push({ key, element })
      }
      if (!queued && pending.length > 0) queueMicrotask(flashPending)
    }
    measure()
    const resize = new ResizeObserver(schedule)
    resize.observe(anchor)
    resize.observe(railHost(anchor))
    window.addEventListener("resize", schedule)
    const unregister = mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        measure()
        setActive(
          editorState.read(() => $findBlockAtSelection()?.getKey() ?? null)
        )
      }),
      editor.registerMutationListener(TicketBlockNode, flashCreated, {
        skipInitialization: true
      }),
      editor.registerMutationListener(SyncedBlockNode, flashCreated, {
        skipInitialization: true
      })
    )
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.clearTimeout(landed)
      resize.disconnect()
      window.removeEventListener("resize", schedule)
      unregister()
    }
  }, [anchor, editor])

  useEffect(() => {
    if (anchor === null) return
    const area = anchor.closest<HTMLElement>(".block-gutter") ?? anchor
    const move = (event: PointerEvent) =>
      setHovered(blockAtY(editor, items, event.clientY))
    const leave = () => setHovered(null)
    const focusIn = (event: FocusEvent) =>
      setEditorFocused(event.target === editor.getRootElement())
    const focusOut = () => setEditorFocused(false)
    area.addEventListener("pointermove", move)
    area.addEventListener("pointerleave", leave)
    area.addEventListener("focusin", focusIn)
    area.addEventListener("focusout", focusOut)
    return () => {
      area.removeEventListener("pointermove", move)
      area.removeEventListener("pointerleave", leave)
      area.removeEventListener("focusin", focusIn)
      area.removeEventListener("focusout", focusOut)
    }
  }, [anchor, editor, items])

  const editing = editorFocused ? active : null

  useLayoutEffect(() => {
    if (editing === null) return
    const element = editor.getElementByKey(editing)
    if (element === null) return
    element.dataset.active = ""
    return () => {
      delete element.dataset.active
    }
  }, [editor, editing])

  useLayoutEffect(() => {
    if (hovered === null) return
    const element = editor.getElementByKey(hovered)
    if (element === null) return
    element.dataset.hovered = ""
    return () => {
      delete element.dataset.hovered
    }
  }, [editor, hovered])

  if (anchor === null) return null

  return createPortal(
    <TooltipProvider>
      <div className="pointer-events-none absolute inset-0" data-block-gutter>
        {rail !== null && (
          <div
            aria-hidden
            data-block-rail
            className="pointer-events-auto absolute inset-y-0"
            style={{ left: rail, width: -rail }}
          />
        )}
        {rail !== null &&
          items.map((item) => (
            <GutterButton
              key={item.key}
              nodeKey={item.key}
              blockType={item.blockType}
              lookup={lookup}
              top={item.top}
              left={rail}
              landOrder={landing.get(item.key)}
            />
          ))}
      </div>
    </TooltipProvider>,
    anchor
  )
}
