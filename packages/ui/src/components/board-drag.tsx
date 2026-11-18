import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source"
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview"
import { Reorder, useDragControls, type HTMLMotionProps } from "motion/react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type RefObject
} from "react"

import {
  boardSlotAttribute,
  isBoardCardDrag,
  isBoardDrop,
  type BoardCardDragData,
  type BoardCardDropData,
  type BoardColumnDropData,
  type BoardDropData
} from "../lib/boardDragData"
import { transitions } from "../lib/springs"
import {
  boardCollapsedColumnClass,
  boardColumnClass,
  boardColumnTone
} from "./board-column"

/*
 * Everything a board drags, shared by the app's boards and the gallery so
 * both move the same way:
 *
 * - Columns reorder by their grips: `BoardColumns` (a horizontal Reorder
 *   group that keeps its width while a column is out of the flow) holds
 *   `BoardColumnFrame`s, whose render prop hands the header its
 *   `startReorder`. Letting go calls `onReorderEnd`, where the app saves.
 * - Cards drag between and within columns (Pragmatic drag and drop):
 *   `useBoardCardDrag` on each card, `useBoardColumnDrop` on each column,
 *   and `useBoardCardDrop` once on the board for the drop itself. Inside a
 *   column `useBoardDropGap` opens a gap where the card will land and
 *   `BoardCardMotion` slides the cards around it.
 * - Near a column's top or bottom edge the list scrolls
 *   (`useBoardEdgeScroll`); near the board's sides, the board
 *   (`useBoardAutoScroll`).
 *
 * The drag data is plain: a card is { type: "card", id, status }, a drop is
 * a card's top or bottom edge or a column's empty space.
 */

const COLUMN_WIDTH = 288
const COLLAPSED_WIDTH = 40
const reorderFade = { duration: 0.2, ease: [0.32, 0.72, 0, 1] } as const

// The board's row of columns. While a column is dragged (reordering) the
// row keeps the width it had, so the scroller doesn't jump as the column
// leaves the flow.
export function BoardColumns<T extends string>({
  values,
  onReorder,
  reordering,
  className,
  children,
  ...props
}: Omit<HTMLMotionProps<"div">, "onReorder" | "values"> &
  Readonly<{
    values: ReadonlyArray<T>
    onReorder: (next: ReadonlyArray<T>) => void
    reordering: boolean
    children: ReactNode
  }>) {
  const row = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = row.current
    if (!element) return
    if (!reordering) {
      element.style.width = ""
      return
    }
    if (element.scrollWidth) element.style.width = `${element.scrollWidth}px`
  }, [reordering])
  return (
    <Reorder.Group
      ref={row}
      as="div"
      axis="x"
      values={[...values]}
      onReorder={(next: Array<T>) => onReorder(next)}
      className={className}
      {...props}
    >
      {children}
    </Reorder.Group>
  )
}

export type BoardColumnFrameState = Readonly<{
  // For the header's grip (BoardColumnHeader onReorderStart).
  startReorder: (event: ReactPointerEvent) => void
}>

// One column on a reorderable board: its well (open or folded, the width
// easing between them), its tone, the drop ring (`over`), and the lift
// while it's dragged by its grip.
export function BoardColumnFrame({
  ref,
  value,
  tone,
  collapsed = false,
  over = false,
  onReorderStart,
  onReorderEnd,
  className,
  children,
  ...props
}: Omit<
  HTMLMotionProps<"div">,
  "children" | "ref" | "value" | "animate" | "transition" | "layout"
> &
  Readonly<{
    ref?: Ref<HTMLDivElement>
    value: string
    tone?: string | null
    collapsed?: boolean
    // A card is dragged over it (useBoardColumnDrop).
    over?: boolean
    onReorderStart?: () => void
    // The grip is let go: save the order here.
    onReorderEnd?: () => void
    children: (frame: BoardColumnFrameState) => ReactNode
  }>) {
  const controls = useDragControls()
  const [lifted, setLifted] = useState(false)
  const startReorder = (event: ReactPointerEvent) => {
    onReorderStart?.()
    controls.start(event)
    if (onReorderEnd === undefined) return
    const end = () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      onReorderEnd()
    }
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }
  return (
    <Reorder.Item
      ref={ref}
      as="div"
      value={value}
      initial={false}
      layout="position"
      dragListener={false}
      dragControls={controls}
      dragElastic={0.05}
      onDragStart={() => setLifted(true)}
      onDragEnd={() => setLifted(false)}
      data-over={over || undefined}
      style={boardColumnTone(tone)}
      animate={{
        filter: lifted
          ? "drop-shadow(0 10px 24px rgb(0 0 0 / 0.12))"
          : "drop-shadow(0 0 0 transparent)",
        zIndex: lifted ? 20 : 0,
        width: collapsed ? COLLAPSED_WIDTH : COLUMN_WIDTH
      }}
      transition={{
        width: transitions.layout,
        layout: transitions.layout,
        filter: reorderFade,
        zIndex: { duration: 0 }
      }}
      className={[
        collapsed ? boardCollapsedColumnClass : boardColumnClass,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children({ startReorder })}
    </Reorder.Item>
  )
}

// A card that drags: the whole card is the handle, the preview is a clone
// at its size and grab offset, and (in an ordered column) its slot takes
// drops on its top or bottom half. Returns whether it's being dragged.
//
// The card's ItemLink (stretched over it) is a drag source of its own:
// Chromium often won't start a drag from a press on a draggable="false"
// link inside a draggable card, so the link carries the same drag (and
// stays a real link: hover, ⌘-click, right-click). The card itself still
// drags from its chips and avatar, which sit above the link.
export function useBoardCardDrag({
  slot,
  card,
  id,
  status,
  enabled,
  ordered = true
}: Readonly<{
  slot: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  id: string
  status: string
  enabled: boolean
  ordered?: boolean
}>) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const element = slot.current
    const handle = card.current
    if (!enabled || !element || !handle) return undefined
    const source = (element: HTMLElement) =>
      draggable({
        element,
        getInitialData: () =>
          ({
            type: "card",
            id,
            status
          }) satisfies BoardCardDragData,
        onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element: handle,
              input: location.current.input
            }),
            render: ({ container }) => {
              const rect = handle.getBoundingClientRect()
              const clone = handle.cloneNode(true)
              if (!(clone instanceof HTMLElement)) return
              clone.style.width = `${rect.width}px`
              clone.style.height = `${rect.height}px`
              container.appendChild(clone)
            }
          })
        },
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false)
      })
    const link = handle.querySelector<HTMLElement>("[data-item-link]")
    const stops = [source(handle), ...(link ? [source(link)] : [])]
    const stopDrag = () => {
      for (const stop of stops) stop()
      // Unregistering drops the attribute, and a bare link drags its URL.
      link?.setAttribute("draggable", "false")
    }
    if (!ordered) return stopDrag
    const stopDrop = dropTargetForElements({
      element:
        element.closest<HTMLElement>(`[${boardSlotAttribute}]`) ?? element,
      getData: ({ input, element: target }) => {
        const rect = target.getBoundingClientRect()
        const edge =
          input.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
        return { type: "card", id, status, edge } satisfies BoardCardDropData
      }
    })
    return () => {
      stopDrag()
      stopDrop()
    }
  }, [slot, card, id, status, enabled, ordered])
  return dragging
}

// A column as a drop target: dropping on its empty space puts the card at
// the end. Returns whether a card is over it (for the ring).
export function useBoardColumnDrop(
  element: HTMLElement | null,
  status: string,
  enabled: boolean
) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!enabled || !element) return undefined
    const stopDrop = dropTargetForElements({
      element,
      getData: () => ({ type: "column", status }) satisfies BoardColumnDropData
    })
    const update = ({
      location
    }: Readonly<{
      location: {
        current: { dropTargets: ReadonlyArray<{ element: Element }> }
      }
    }>) => {
      const inner = location.current.dropTargets[0]?.element
      setOver(inner != null && element.contains(inner))
    }
    const stopMonitor = monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDrop: () => setOver(false)
    })
    return () => {
      stopDrop()
      stopMonitor()
      setOver(false)
    }
  }, [element, status, enabled])
  return over
}

// The drop itself, once per board: where a card was let go. A card dropped
// on itself is ignored.
export function useBoardCardDrop(
  enabled: boolean,
  onDrop: (card: BoardCardDragData, target: BoardDropData) => void
) {
  const handler = useRef(onDrop)
  useLayoutEffect(() => {
    handler.current = onDrop
  })
  useEffect(() => {
    if (!enabled) return undefined
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]?.data
        if (!isBoardCardDrag(source.data) || !isBoardDrop(target)) return
        if (target.type === "card" && target.id === source.data.id) return
        handler.current(source.data, target)
      }
    })
  }, [enabled])
}

export {
  BoardCardMotion,
  boardDropOffset,
  BoardDropGap,
  useBoardDropGap,
  type BoardDrag
} from "./board-card-motion"
export { useBoardAutoScroll, useBoardEdgeScroll } from "../hooks/useBoardScroll"
export {
  BoardCardDragData,
  BoardCardDropData,
  BoardColumnDropData,
  BoardDropData,
  boardSlotAttribute,
  isBoardCardDrag,
  isBoardDrop
} from "../lib/boardDragData"
