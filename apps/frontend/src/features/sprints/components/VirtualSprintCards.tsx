import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import type { Ticket } from "@pp/shared"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import { useReducedMotion } from "motion/react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import { cn } from "@/lib/utils"

import { useDeferredOverscan } from "../../tickets/components/ticket-list/useDeferredOverscan"
import { useBoardColumnKeyboard } from "../hooks/useBoardKeyboardNavigation"
import { useSprintEdgeScroll } from "../hooks/useSprintEdgeScroll"
import { BOARD_CARD_SLOT_CLASS, BoardCardList } from "./BoardColumnShell"
import { SprintCardMotion } from "./SprintCardMotion"

const ESTIMATED_CARD_HEIGHT = 104
const LOAD_AHEAD = 10

export function VirtualSprintCards({
  tickets,
  total = tickets.length,
  isDraggable,
  status,
  showDropGap = true,
  filterKey,
  footer,
  children
}: {
  tickets: ReadonlyArray<Ticket>
  total?: number
  isDraggable: boolean
  status: string
  showDropGap?: boolean
  filterKey: string
  footer?: (nearEnd: boolean) => ReactNode
  children: (ticket: Ticket) => ReactNode
}) {
  "use no memo"

  const reducedMotion = useReducedMotion()
  const [drag, setDrag] = useState<{
    id: string
    index: number | null
    height: number
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])
  const overscan = useDeferredOverscan(getScrollElement, 4)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusedIndex = tickets.findIndex((ticket) => ticket.id === focusedId)
  const count = Math.max(total, tickets.length)
  const getItemKey = useCallback(
    (index: number) => tickets[index]?.id ?? `placeholder-${index}`,
    [tickets]
  )
  // oxlint-disable-next-line react/incompatible-library -- This component opts out of React Compiler.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count,
    getScrollElement,
    getItemKey,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = defaultRangeExtractor(range)
        return focusedIndex >= 0 && !indexes.includes(focusedIndex)
          ? [...indexes, focusedIndex].toSorted((a, b) => a - b)
          : indexes
      },
      [focusedIndex]
    )
  })

  const ticketIds = useMemo(() => tickets.map((ticket) => ticket.id), [tickets])
  const reveal = useCallback(
    (index: number) => {
      setFocusedId(tickets[index]?.id ?? null)
      virtualizer.scrollToIndex(index, { align: "auto" })
    },
    [tickets, virtualizer]
  )
  useBoardColumnKeyboard(status, ticketIds, reveal)

  useSprintEdgeScroll(scrollRef, isDraggable)

  const ticketsRef = useRef(tickets)
  useLayoutEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    if (!isDraggable) return undefined
    const update: Parameters<typeof monitorForElements>[0]["onDrag"] = ({
      source,
      location
    }) => {
      if (source.data.type !== "card" || typeof source.data.id !== "string")
        return
      const items = ticketsRef.current
      const target = location.current.dropTargets.find(
        ({ data }) => data.type === "card" || data.type === "column"
      )
      const index =
        target?.data.status !== status
          ? null
          : target.data.type === "column"
            ? items.length
            : target.data.id === source.data.id
              ? items.findIndex((ticket) => ticket.id === source.data.id)
              : items.findIndex((ticket) => ticket.id === target.data.id) +
                (target.data.edge === "bottom" ? 1 : 0)
      const height =
        source.element.closest("[data-ticket-id]")?.getBoundingClientRect()
          .height ?? ESTIMATED_CARD_HEIGHT
      const id = source.data.id
      setDrag((current) =>
        current?.id === id &&
        current.index === index &&
        current.height === height
          ? current
          : { id, index, height }
      )
    }
    return monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDropTargetChange: update,
      onDrop: () => setDrag(null)
    })
  }, [isDraggable, status])

  const sourceIndex = drag
    ? tickets.findIndex((ticket) => ticket.id === drag.id)
    : -1
  const rows = virtualizer.getVirtualItems()
  const nearEnd =
    tickets.length < count &&
    (rows.at(-1)?.index ?? 0) >= tickets.length - LOAD_AHEAD
  const gapStart =
    showDropGap && drag?.index != null
      ? (rows.find((row) => row.index === drag.index)?.start ??
          virtualizer.getTotalSize()) -
        (sourceIndex >= 0 && sourceIndex < drag.index ? drag.height : 0)
      : null
  return (
    <BoardCardList
      viewportProps={{
        ref: scrollRef,
        "data-virtual-sprint-column": status,
        "data-loaded-cards": tickets.length,
        "data-mounted-cards": rows.length,
        style: { overflowAnchor: "none" },
        onBlurCapture: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocusedId(null)
        }
      }}
    >
      <ul
        className="relative w-full overflow-clip"
        style={{
          height:
            virtualizer.getTotalSize() +
            (showDropGap && drag?.index != null && sourceIndex < 0
              ? drag.height
              : 0)
        }}
      >
        {gapStart !== null && drag && (
          <div
            aria-hidden
            data-sprint-drop-gap
            className="pointer-events-none absolute inset-x-2 top-0 rounded-lg bg-accent/40"
            style={{
              height: drag.height - 8,
              transform: `translateY(${gapStart === 0 ? 0 : gapStart + 4}px)`
            }}
          />
        )}
        {rows.map((row) =>
          row.index >= tickets.length ? (
            <li
              key={row.key}
              data-index={row.index}
              aria-hidden
              className={cn(
                BOARD_CARD_SLOT_CLASS,
                "absolute top-0 left-0 w-full"
              )}
              style={{
                height: ESTIMATED_CARD_HEIGHT,
                transform: `translateY(${row.start}px)`
              }}
            >
              <div className="size-full animate-pulse rounded-lg bg-surface-3/60 motion-reduce:animate-none" />
            </li>
          ) : (
            <li
              key={row.key}
              ref={virtualizer.measureElement}
              aria-setsize={count}
              aria-posinset={row.index + 1}
              data-index={row.index}
              data-ticket-id={tickets[row.index].id}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${row.start}px)` }}
              onFocusCapture={() => setFocusedId(tickets[row.index].id)}
            >
              <SprintCardMotion
                index={row.index}
                start={row.start}
                offset={
                  showDropGap && drag && row.index !== sourceIndex
                    ? (sourceIndex >= 0 && row.index > sourceIndex
                        ? -drag.height
                        : 0) +
                      (drag.index !== null && row.index >= drag.index
                        ? drag.height
                        : 0)
                    : 0
                }
                hidden={drag?.id === tickets[row.index].id}
                reducedMotion={
                  Boolean(reducedMotion) || virtualizer.isScrolling
                }
                filterKey={filterKey}
              >
                {children(tickets[row.index])}
              </SprintCardMotion>
            </li>
          )
        )}
      </ul>
      {footer?.(nearEnd)}
    </BoardCardList>
  )
}
