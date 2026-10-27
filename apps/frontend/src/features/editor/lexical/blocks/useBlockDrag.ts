import { $getRoot, type LexicalEditor, type NodeKey } from "lexical"
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue
} from "motion/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react"
import { flushSync } from "react-dom"

import { transitions } from "@/lib/springs"

import { $isTopLevelBlockNode } from "./blockCommands"
import { layoutTop } from "./blockRail"
import {
  dragLayout,
  dropPlacement,
  insertionIndexAt,
  type DragSlot,
  type DropPlacement
} from "./dragLayout"

const DRAG_THRESHOLD = 4
const PREVIEW_MAX_HEIGHT = 320
const INSTANT = { duration: 0 }

export type BlockDrag = Readonly<{
  key: NodeKey
  settling: boolean
  left: number
  width: number
  clamped: boolean
  clone: HTMLElement
  shifts: ReadonlyMap<NodeKey, number>
}>

type Pending = Readonly<{
  key: NodeKey
  pointerId: number
  startX: number
  startY: number
}>

type Session = {
  readonly key: NodeKey
  readonly pointerId: number
  readonly offsetY: number
  readonly slots: ReadonlyArray<DragSlot>
  readonly dragIndex: number
  index: number
}

type GripHandlers = Readonly<{
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
}>

const $slotKeys = (): ReadonlyArray<NodeKey> => {
  const children = $getRoot().getChildren()
  const last = children.at(-1)
  const trailingBlank =
    last !== undefined &&
    !$isTopLevelBlockNode(last) &&
    last.getTextContent().trim() === "" &&
    children.length > 1
  return (trailingBlank ? children.slice(0, -1) : children).map((node) =>
    node.getKey()
  )
}

const measureSlots = (
  editor: LexicalEditor,
  anchor: HTMLElement
): ReadonlyArray<DragSlot> =>
  editor.getEditorState().read(() =>
    $slotKeys().flatMap((key) => {
      const element = editor.getElementByKey(key)
      return element === null
        ? []
        : [
            {
              key,
              top: layoutTop(element, anchor),
              height: element.getBoundingClientRect().height
            }
          ]
    })
  )

const clonePreview = (element: HTMLElement): HTMLElement => {
  const clone = element.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return document.createElement("div")
  for (const attribute of ["hovered", "flash", "dragging", "selected"])
    delete clone.dataset[attribute]
  clone.removeAttribute("contenteditable")
  for (const editable of clone.querySelectorAll("[contenteditable]"))
    editable.removeAttribute("contenteditable")
  clone.style.margin = "0"
  clone.style.transform = "none"
  return clone
}

export function useBlockDrag({
  editor,
  anchor,
  onDrop
}: Readonly<{
  editor: LexicalEditor
  anchor: HTMLElement | null
  onDrop: (key: NodeKey, target: DropPlacement) => void
}>) {
  const reduceMotion = useReducedMotion() ?? false
  const transition = reduceMotion ? INSTANT : transitions.layout
  const previewY: MotionValue<number> = useMotionValue(0)
  const [drag, setDrag] = useState<BlockDrag | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const suppressClickRef = useRef(false)

  const shiftSlots = useCallback(
    (slots: ReadonlyArray<DragSlot>, shifts: ReadonlyMap<NodeKey, number>) => {
      for (const slot of slots) {
        const element = editor.getElementByKey(slot.key)
        if (element !== null)
          void animate(element, { y: shifts.get(slot.key) ?? 0 }, transition)
      }
    },
    [editor, transition]
  )

  const settle = useCallback(
    (session: Session, target: DropPlacement | null) => {
      if (anchor === null) return
      const visual = new Map(
        session.slots.map((slot) => [
          slot.key,
          editor.getElementByKey(slot.key)?.getBoundingClientRect().top
        ])
      )
      flushSync(() => setDrag(null))
      const source = editor.getElementByKey(session.key)
      if (source !== null) delete source.dataset.dragging
      if (target !== null) onDrop(session.key, target)
      for (const slot of session.slots) {
        const element = editor.getElementByKey(slot.key)
        const before = visual.get(slot.key)
        if (element === null || before === undefined) continue
        const delta =
          before -
          anchor.getBoundingClientRect().top -
          layoutTop(element, anchor)
        void animate(
          element,
          { y: Math.abs(delta) < 0.5 ? 0 : [delta, 0] },
          Math.abs(delta) < 0.5 ? INSTANT : transition
        )
      }
    },
    [anchor, editor, onDrop, transition]
  )

  const finish = useCallback(
    (commit: boolean) => {
      const session = sessionRef.current
      sessionRef.current = null
      pendingRef.current = null
      if (session === null) return
      const index = commit ? session.index : session.dragIndex
      const target = dropPlacement(session.slots, session.dragIndex, index)
      const layout = dragLayout(session.slots, session.dragIndex, index)
      shiftSlots(session.slots, layout.shifts)
      setDrag((current) =>
        current === null
          ? null
          : { ...current, settling: true, shifts: layout.shifts }
      )
      void animate(previewY, layout.ghostTop, transition).then(() =>
        settle(session, target)
      )
    },
    [previewY, settle, shiftSlots, transition]
  )

  useEffect(() => {
    if (drag === null || drag.settling) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      suppressClickRef.current = true
      finish(false)
    }
    window.addEventListener("keydown", cancel, true)
    return () => window.removeEventListener("keydown", cancel, true)
  }, [drag, finish])

  const start = (pending: Pending) => {
    const element = editor.getElementByKey(pending.key)
    if (element === null || anchor === null) return
    const anchorRect = anchor.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const slots = measureSlots(editor, anchor)
    const dragIndex = slots.findIndex((slot) => slot.key === pending.key)
    if (dragIndex === -1) return
    sessionRef.current = {
      key: pending.key,
      pointerId: pending.pointerId,
      offsetY: pending.startY - rect.top,
      slots,
      dragIndex,
      index: dragIndex
    }
    previewY.set(rect.top - anchorRect.top)
    const clone = clonePreview(element)
    element.dataset.dragging = ""
    setDrag({
      key: pending.key,
      settling: false,
      left: rect.left - anchorRect.left,
      width: rect.width,
      clamped: rect.height > PREVIEW_MAX_HEIGHT,
      clone,
      shifts: new Map()
    })
  }

  const follow = (session: Session, clientY: number) => {
    if (anchor === null) return
    const anchorTop = anchor.getBoundingClientRect().top
    previewY.set(clientY - anchorTop - session.offsetY)
    const index = insertionIndexAt(
      session.slots,
      session.dragIndex,
      clientY - anchorTop
    )
    if (index === session.index) return
    session.index = index
    const { shifts } = dragLayout(session.slots, session.dragIndex, index)
    shiftSlots(session.slots, shifts)
    setDrag((current) => (current === null ? null : { ...current, shifts }))
  }

  const gripHandlers = (key: NodeKey): GripHandlers => ({
    onPointerDown: (event) => {
      if (event.button !== 0 || !editor.isEditable()) return
      if (sessionRef.current !== null || drag !== null) return
      event.currentTarget.setPointerCapture(event.pointerId)
      pendingRef.current = {
        key,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY
      }
    },
    onPointerMove: (event) => {
      const session = sessionRef.current
      if (session !== null) {
        if (session.pointerId === event.pointerId)
          follow(session, event.clientY)
        return
      }
      const pending = pendingRef.current
      if (pending === null || pending.pointerId !== event.pointerId) return
      const distance = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      )
      if (distance <= DRAG_THRESHOLD) return
      pendingRef.current = null
      start(pending)
      const started = sessionRef.current
      if (started !== null) follow(started, event.clientY)
    },
    onPointerUp: (event) => {
      pendingRef.current = null
      const session = sessionRef.current
      if (session === null || session.pointerId !== event.pointerId) return
      suppressClickRef.current = true
      follow(session, event.clientY)
      finish(true)
    },
    onPointerCancel: () => finish(false)
  })

  const consumeClick = (): boolean => {
    const suppressed = suppressClickRef.current
    suppressClickRef.current = false
    return suppressed
  }

  const isDragging = (): boolean => sessionRef.current !== null

  return { drag, previewY, gripHandlers, consumeClick, isDragging }
}
