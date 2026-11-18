import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

import {
  BoardDropData,
  boardSlotAttribute,
  isBoardCardDrag,
  isBoardDrop
} from "../lib/boardDragData"

// The gap a dragged card opens in a column, and the cards sliding around
// it. Part of the board's drag (board-drag.tsx), exported from there.

const ESTIMATED_CARD_HEIGHT = 104

export type BoardDrag = Readonly<{
  id: string
  // Where in this column the card would land; null while it's elsewhere.
  index: number | null
  height: number
}>

// A column's view of a card drag: which card, where it would land here and
// how tall it is, so the column can open a gap of that height.
export function useBoardDropGap(
  status: string,
  ids: ReadonlyArray<string>,
  enabled: boolean
) {
  const [drag, setDrag] = useState<BoardDrag | null>(null)
  const latest = useRef(ids)
  useLayoutEffect(() => {
    latest.current = ids
  }, [ids])
  useEffect(() => {
    if (!enabled) return undefined
    const update: Parameters<typeof monitorForElements>[0]["onDrag"] = ({
      source,
      location
    }) => {
      if (!isBoardCardDrag(source.data)) return
      const items = latest.current
      const card = source.data
      const target = location.current.dropTargets
        .map(({ data }) => data)
        .find(isBoardDrop)
      const index =
        target?.status !== status
          ? null
          : BoardDropData.match(target, {
              column: () => items.length,
              card: (drop) =>
                drop.id === card.id
                  ? items.indexOf(card.id)
                  : items.indexOf(drop.id) + (drop.edge === "bottom" ? 1 : 0)
            })
      const height =
        source.element
          .closest(`[${boardSlotAttribute}]`)
          ?.getBoundingClientRect().height ?? ESTIMATED_CARD_HEIGHT
      setDrag((current) =>
        current?.id === card.id &&
        current.index === index &&
        current.height === height
          ? current
          : { id: card.id, index, height }
      )
    }
    return monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDropTargetChange: update,
      onDrop: () => setDrag(null)
    })
  }, [enabled, status])
  return drag
}

// How far a card at `index` moves for the gap: up by the dragged card's
// height once it's past the card that left, down by it from where the gap
// opens.
export const boardDropOffset = (
  drag: BoardDrag | null,
  index: number,
  sourceIndex: number
) =>
  drag === null || index === sourceIndex
    ? 0
    : (sourceIndex >= 0 && index > sourceIndex ? -drag.height : 0) +
      (drag.index !== null && index >= drag.index ? drag.height : 0)

// The gap a dragged card will land in: a soft well where it goes.
export function BoardDropGap({
  top,
  height
}: Readonly<{ top: number; height: number }>) {
  return (
    <div
      aria-hidden
      data-board-drop-gap
      className="pointer-events-none absolute inset-x-2 top-0 rounded-[14px] bg-foreground/5 [corner-shape:var(--button-corner)]"
      style={{
        height: height - 8,
        transform: `translateY(${top === 0 ? 0 : top + 4}px)`
      }}
    />
  )
}

const translateYOf = (node: HTMLElement) => {
  const transform = getComputedStyle(node).transform
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42
}

// A card in a column, sliding to make room: when its place (`start`) or its
// gap offset changes it eases there over 180ms from wherever it was,
// mid-slide included. The dragged card itself (`hidden`) stays in place,
// invisible. A new filter (`resetKey`) or reduced motion moves it at once.
export function BoardCardMotion({
  index,
  start,
  offset,
  hidden,
  reducedMotion,
  resetKey,
  children
}: Readonly<{
  index: number
  start: number
  offset: number
  hidden: boolean
  reducedMotion: boolean
  resetKey?: string
  children: ReactNode
}>) {
  const element = useRef<HTMLDivElement>(null)
  const previous = useRef<Readonly<{
    index: number
    start: number
    offset: number
    hidden: boolean
    resetKey: string | undefined
  }> | null>(null)
  const animation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const node = element.current
    if (!node) return
    const before = previous.current
    if (
      before &&
      before.start === start &&
      before.offset === offset &&
      before.hidden === hidden &&
      before.resetKey === resetKey
    ) {
      if (reducedMotion) animation.current?.cancel()
      return
    }
    const currentOffset =
      animation.current?.playState === "running"
        ? translateYOf(node)
        : (before?.offset ?? offset)
    const from = before ? before.start + currentOffset - start : offset
    animation.current?.cancel()
    node.style.transform = `translateY(${offset}px)`
    previous.current = { index, start, offset, hidden, resetKey }
    if (
      !before ||
      (before.index === index &&
        before.offset === offset &&
        before.hidden === hidden) ||
      before.hidden ||
      before.resetKey !== resetKey ||
      hidden ||
      reducedMotion ||
      Math.abs(from - offset) < 0.5
    )
      return
    animation.current = node.animate(
      [
        { transform: `translateY(${from}px)` },
        { transform: `translateY(${offset}px)` }
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    )
  }, [index, start, offset, hidden, reducedMotion, resetKey])

  useLayoutEffect(() => () => animation.current?.cancel(), [])

  return (
    <div
      ref={element}
      data-board-card-motion
      style={{
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : undefined
      }}
    >
      {children}
    </div>
  )
}
