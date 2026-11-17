import { useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { boardCardSlotClass, BoardCardList } from "@pp/ui/board-column"
import {
  BoardCardMotion,
  boardDropOffset,
  BoardDropGap,
  boardSlotAttribute,
  useBoardDropGap,
  useBoardEdgeScroll
} from "@pp/ui/board-drag"
import { cn } from "@pp/ui/lib/utils"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import { useReducedMotion } from "motion/react"
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import {
  justCreatedTicket,
  type JustCreatedTicket
} from "@/features/tickets/atoms/createTicket"
import { isFresh } from "@/features/tickets/components/ticket-list/CreatedRow"
import { m } from "@/paraglide/messages"

import { useDeferredOverscan } from "../../tickets/components/ticket-list/useDeferredOverscan"
import { useBoardColumnKeyboard } from "../hooks/useBoardKeyboardNavigation"

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

  useBoardEdgeScroll(scrollRef, isDraggable)
  const drag = useBoardDropGap(status, ticketIds, isDraggable)

  const created = useAtomValue(justCreatedTicket)
  const createdIndex =
    created === null
      ? -1
      : tickets.findIndex((ticket) => ticket.id === created.id)
  const shownCreated = useRef<JustCreatedTicket | null>(null)
  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (
      created === null ||
      createdIndex < 0 ||
      !viewport ||
      created === shownCreated.current ||
      !isFresh(created.at)
    )
      return
    shownCreated.current = created
    viewport
      .closest("[data-board-column]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
    const item = virtualizer.measurementsCache[createdIndex]
    const visible =
      item !== undefined &&
      item.start >= viewport.scrollTop &&
      item.end <= viewport.scrollTop + viewport.clientHeight
    if (!visible) virtualizer.scrollToIndex(createdIndex, { align: "center" })
  })

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
      scrollLabel={m.common_scroll_area_label()}
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
          <BoardDropGap top={gapStart} height={drag.height} />
        )}
        {rows.map((row) =>
          row.index >= tickets.length ? (
            <li
              key={row.key}
              data-index={row.index}
              aria-hidden
              className={cn(boardCardSlotClass, "absolute top-0 left-0 w-full")}
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
              {...{ [boardSlotAttribute]: "" }}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${row.start}px)` }}
              onFocusCapture={() => setFocusedId(tickets[row.index].id)}
            >
              <BoardCardMotion
                index={row.index}
                start={row.start}
                offset={
                  showDropGap
                    ? boardDropOffset(drag, row.index, sourceIndex)
                    : 0
                }
                hidden={drag?.id === tickets[row.index].id}
                reducedMotion={
                  Boolean(reducedMotion) || virtualizer.isScrolling
                }
                resetKey={filterKey}
              >
                {children(tickets[row.index])}
              </BoardCardMotion>
            </li>
          )
        )}
      </ul>
      {footer?.(nearEnd)}
    </BoardCardList>
  )
}
