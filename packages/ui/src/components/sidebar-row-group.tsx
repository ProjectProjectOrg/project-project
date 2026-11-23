import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  useReducedMotion
} from "motion/react"
import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"

type SidebarRowGroupProps = Readonly<{
  children: ReactNode
  // Makes the rows sortable by dragging (and Alt+Up/Down on a focused row).
  // Called once, on drop, with every key in the new order.
  onReorder?: (keys: ReadonlyArray<string>) => void
  // Rows that stay put and can't be dragged (the live row). They keep their
  // place at the head of the group.
  isSortable?: (key: string) => boolean
}>

const ALWAYS = () => true

// While a row is dragged, the whole page shows the closed hand.
const DRAGGING_CLASS = "pp-sidebar-dragging"

// Children.toArray prefixes keys (".$pin") and escapes "=" and ":" as "=0"
// and "=2"; hand callers back their own.
const ownKey = (key: string) =>
  key
    .replace(/^\.\$/u, "")
    .replace(/=([02])/gu, (_, code: string) => (code === "0" ? "=" : ":"))

const sameOrder = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((key, index) => key === b[index])

const presence = {
  initial: "hidden",
  animate: "shown",
  exit: "gone",
  variants: {
    hidden: { opacity: 0, height: 0, overflow: "hidden" },
    shown: {
      opacity: 1,
      height: "auto",
      overflow: "hidden",
      transitionEnd: { overflow: "visible" },
      transition: transitions.layout
    },
    gone: {
      opacity: 0,
      height: 0,
      overflow: "hidden",
      transition: { ...transitions.layout, duration: 0.18 }
    }
  }
} as const

// Rows that come and go (pins): each one grows in, shrinks out, and glides
// when its neighbours move. Keep a row's key stable across a style change
// (live -> pinned) so it stays mounted. With `onReorder` the rows also sort
// by pointer drag (motion's Reorder): the dragged row follows the pointer on
// the accent fill, the others glide out of its way, and the order is
// committed on release. Pointer events, not native drag and drop, so the
// cursor is ours and the browser adds no copy badge.
function SidebarRowGroup({
  children,
  onReorder,
  isSortable = ALWAYS
}: SidebarRowGroupProps) {
  const reduce = useReducedMotion() ?? false
  const items = Children.toArray(children).filter(isValidElement)
  const keys = items.map((child) => ownKey(String(child.key)))
  const byKey = new Map(keys.map((key, index) => [key, items[index]] as const))
  const [preview, setPreview] = useState<ReadonlyArray<string> | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const latest = useRef({ keys, preview, onReorder })
  useLayoutEffect(() => {
    latest.current = { keys, preview, onReorder }
  })
  useEffect(
    () => () => document.documentElement.classList.remove(DRAGGING_CLASS),
    []
  )

  const fixed = keys.filter((key) => !isSortable(key))
  const movable = (preview ?? keys).filter(
    (key) => byKey.has(key) && isSortable(key)
  )
  const rows = (key: string) => byKey.get(key) ?? null

  if (onReorder === undefined)
    return (
      <AnimatePresence initial={false}>
        {keys.map((key) => (
          <motion.div
            key={key}
            layout={reduce ? false : "position"}
            transition={transitions.layout}
            {...presence}
          >
            {rows(key)}
          </motion.div>
        ))}
      </AnimatePresence>
    )

  const finish = () => {
    document.documentElement.classList.remove(DRAGGING_CLASS)
    const { keys: current, preview: next, onReorder: commit } = latest.current
    setDragging(null)
    setPreview(null)
    if (next !== null && !sameOrder(next, current)) commit?.(next)
  }

  const keyboardMove = (key: string, by: -1 | 1) => {
    const order = keys.filter(isSortable)
    const index = order.indexOf(key)
    const target = order[index + by]
    if (target === undefined) return
    const next = [...order]
    next[index] = target
    next[index + by] = key
    onReorder([...fixed, ...next])
  }

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={[...movable]}
      onReorder={(next: string[]) => setPreview([...fixed, ...next])}
      className="relative flex flex-col"
    >
      <AnimatePresence initial={false}>
        {fixed.map((key) => (
          <motion.div
            key={key}
            layout={reduce ? false : "position"}
            transition={transitions.layout}
            {...presence}
          >
            {rows(key)}
          </motion.div>
        ))}
        {movable.map((key) => (
          <SortableRow
            key={key}
            value={key}
            reduce={reduce}
            dragging={dragging === key}
            onDragStart={() => {
              document.documentElement.classList.add(DRAGGING_CLASS)
              setDragging(key)
              setPreview(latest.current.keys)
            }}
            onDragEnd={finish}
            onKeyboardMove={(by) => keyboardMove(key, by)}
          >
            {rows(key)}
          </SortableRow>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  )
}

function SortableRow({
  value,
  reduce,
  dragging,
  onDragStart,
  onDragEnd,
  onKeyboardMove,
  children
}: Readonly<{
  value: string
  reduce: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onKeyboardMove: (by: -1 | 1) => void
  children: ReactNode
}>) {
  const controls = useDragControls()
  // The click that ends a drag must not also open the row.
  const dragged = useRef(false)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey) return
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    onKeyboardMove(event.key === "ArrowUp" ? -1 : 1)
  }

  return (
    <Reorder.Item
      as="div"
      value={value}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={reduce ? { duration: 0 } : transitions.layout}
      {...presence}
      // Mouse and pen drag; a finger scrolls the list instead.
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") controls.start(event)
      }}
      onDragStart={() => {
        dragged.current = true
        onDragStart()
      }}
      onDragEnd={() => {
        onDragEnd()
        // The click (if any) lands before the next frame.
        requestAnimationFrame(() => {
          dragged.current = false
        })
      }}
      onClickCapture={(event) => {
        if (!dragged.current) return
        event.preventDefault()
        event.stopPropagation()
      }}
      // A row is often a link; never let the browser start its own drag.
      onDragStartCapture={(event: { preventDefault: () => void }) =>
        event.preventDefault()
      }
      onKeyDown={onKeyDown}
      style={{ touchAction: "pan-y" }}
      data-dragging={dragging || undefined}
      className={cn("relative", dragging && "pp-sidebar-row-dragging z-20")}
    >
      {children}
    </Reorder.Item>
  )
}

export { SidebarRowGroup }
export type { SidebarRowGroupProps }
