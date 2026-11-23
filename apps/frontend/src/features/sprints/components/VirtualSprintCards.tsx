import type { Ticket } from "@pp/shared"
import { BoardCardList } from "@pp/ui/board-column"
import {
  boardDropOffset,
  BoardDropGap,
  useBoardDropGap,
  useBoardEdgeScroll
} from "@pp/ui/board-drag"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import { useReducedMotion } from "motion/react"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"

import { m } from "@/paraglide/messages"

import { useDeferredOverscan } from "../../tickets/components/ticket-list/useDeferredOverscan"
import { useBoardColumnKeyboard } from "../hooks/useBoardKeyboardNavigation"
import {
  useReportOverflow,
  useRevealCreated,
  useRevealDraft
} from "../hooks/useCardListReveal"
import { draftSlots, withKeptIndexes } from "../lib/draftSlots"
import {
  DraftSlot,
  dropGapTop,
  ESTIMATED_CARD_HEIGHT,
  InsertGaps,
  PlaceholderSlot,
  TicketSlot
} from "./VirtualCardSlots"

const LOAD_AHEAD = 10

const ticketId = (ticket: Ticket) => ticket.id

export type CardsDraft = Readonly<{
  key: string
  index: number
  node: ReactNode
}>

export function VirtualSprintCards({
  tickets,
  total = tickets.length,
  isDraggable,
  status,
  showDropGap = true,
  filterKey,
  footer,
  draft = null,
  onInsertAt,
  onOverflowChange,
  keyOf = ticketId,
  children
}: {
  tickets: ReadonlyArray<Ticket>
  total?: number
  isDraggable: boolean
  status: string
  showDropGap?: boolean
  filterKey: string
  footer?: (nearEnd: boolean) => ReactNode
  draft?: CardsDraft | null
  onInsertAt?: (index: number) => void
  onOverflowChange?: (overflowing: boolean) => void
  keyOf?: (ticket: Ticket) => string
  children: (ticket: Ticket) => ReactNode
}) {
  "use no memo"

  const reducedMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])
  const overscan = useDeferredOverscan(getScrollElement, 4)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const draftIndex = draft === null ? -1 : Math.min(draft.index, tickets.length)
  const { ticketIndexOf, slotIndexOf } = draftSlots(draftIndex)
  const focusedIndex = slotIndexOf(
    tickets.findIndex((ticket) => ticket.id === focusedId)
  )
  const count = Math.max(total, tickets.length) + (draftIndex >= 0 ? 1 : 0)
  const draftKey = draft?.key
  const getItemKey = useCallback(
    (index: number) => {
      if (index === draftIndex && draftKey !== undefined) return draftKey
      const ticket = tickets[draftSlots(draftIndex).ticketIndexOf(index)]
      return ticket ? keyOf(ticket) : `placeholder-${index}`
    },
    [tickets, draftIndex, draftKey, keyOf]
  )
  // oxlint-disable-next-line react/incompatible-library -- This component opts out of React Compiler.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count,
    getScrollElement,
    getItemKey,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan,
    rangeExtractor: useCallback(
      (range) =>
        withKeptIndexes(defaultRangeExtractor(range), [
          focusedIndex,
          draftIndex
        ]),
      [focusedIndex, draftIndex]
    )
  })

  const ticketIds = useMemo(() => tickets.map((ticket) => ticket.id), [tickets])
  const reveal = useCallback(
    (index: number) => {
      setFocusedId(tickets[index]?.id ?? null)
      virtualizer.scrollToIndex(draftSlots(draftIndex).slotIndexOf(index), {
        align: "auto"
      })
    },
    [tickets, virtualizer, draftIndex]
  )
  useBoardColumnKeyboard(status, ticketIds, reveal)

  useBoardEdgeScroll(scrollRef, isDraggable)
  const drag = useBoardDropGap(status, ticketIds, isDraggable)

  useRevealCreated(scrollRef, virtualizer, tickets, slotIndexOf)

  useRevealDraft(scrollRef, virtualizer, draftKey, draftIndex)
  const overflowing = useReportOverflow(
    virtualizer.getTotalSize(),
    virtualizer.scrollRect?.height ?? 0,
    onOverflowChange
  )

  const sourceIndex = drag
    ? tickets.findIndex((ticket) => ticket.id === drag.id)
    : -1
  const rows = virtualizer.getVirtualItems()
  const nearEnd =
    tickets.length < total &&
    ticketIndexOf(rows.at(-1)?.index ?? 0) >= tickets.length - LOAD_AHEAD
  const showInsertGaps =
    onInsertAt !== undefined && draftIndex < 0 && drag === null
  const gapStart = showDropGap
    ? dropGapTop(
        rows,
        drag,
        sourceIndex,
        slotIndexOf,
        virtualizer.getTotalSize()
      )
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
          transition:
            overflowing || reducedMotion
              ? undefined
              : "height 180ms cubic-bezier(0.22, 1, 0.36, 1)",
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
        {showInsertGaps && (
          <InsertGaps
            rows={rows}
            loaded={tickets.length}
            onInsertAt={onInsertAt}
          />
        )}
        {rows.map((row) =>
          row.index === draftIndex && draft !== null ? (
            <DraftSlot
              key={row.key}
              row={row}
              measure={virtualizer.measureElement}
              offset={
                showDropGap
                  ? boardDropOffset(drag, draftIndex - 0.5, sourceIndex)
                  : 0
              }
              reducedMotion={Boolean(reducedMotion) || virtualizer.isScrolling}
              resetKey={filterKey}
            >
              {draft.node}
            </DraftSlot>
          ) : ticketIndexOf(row.index) >= tickets.length ? (
            <PlaceholderSlot key={row.key} row={row} />
          ) : (
            <TicketSlot
              key={row.key}
              row={row}
              ticket={tickets[ticketIndexOf(row.index)]}
              position={ticketIndexOf(row.index) + 1}
              size={Math.max(total, tickets.length)}
              measure={virtualizer.measureElement}
              offset={
                showDropGap
                  ? boardDropOffset(drag, ticketIndexOf(row.index), sourceIndex)
                  : 0
              }
              hidden={drag?.id === tickets[ticketIndexOf(row.index)].id}
              reducedMotion={Boolean(reducedMotion) || virtualizer.isScrolling}
              resetKey={filterKey}
              onFocus={setFocusedId}
            >
              {children}
            </TicketSlot>
          )
        )}
      </ul>
      {footer?.(nearEnd)}
    </BoardCardList>
  )
}
