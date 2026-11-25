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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import {
  dropGapTop,
  ESTIMATED_CARD_HEIGHT
} from "@/features/sprints/lib/draftSlots"
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
  InsertGaps,
  PlaceholderSlot,
  TicketSlot
} from "./VirtualCardSlots"

const LOAD_AHEAD = 10
const DRAFT_TRANSITION_MS = 180

const ticketId = (ticket: Ticket) => ticket.id

export type CardsDraft = Readonly<{
  key: string
  index: number
  node: ReactNode
}>

function virtualListStyle(
  totalSize: number,
  drag: ReturnType<typeof useBoardDropGap>,
  sourceIndex: number,
  animate: boolean
) {
  return {
    transition: animate
      ? `height ${DRAFT_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : undefined,
    height:
      totalSize + (drag?.index != null && sourceIndex < 0 ? drag.height : 0)
  }
}

function useDraftExit(hasDraft: boolean) {
  const [animateDraftExit, setAnimateDraftExit] = useState(hasDraft)
  if (hasDraft && !animateDraftExit) setAnimateDraftExit(true)
  useEffect(() => {
    if (hasDraft || !animateDraftExit) return undefined
    const timer = window.setTimeout(
      () => setAnimateDraftExit(false),
      DRAFT_TRANSITION_MS
    )
    return () => window.clearTimeout(timer)
  }, [hasDraft, animateDraftExit])
  return hasDraft || animateDraftExit
}

function useCardSlots(
  tickets: ReadonlyArray<Ticket>,
  total: number,
  draft: CardsDraft | null,
  focusedId: string | null,
  keyOf: (ticket: Ticket) => string
) {
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
  return {
    draftIndex,
    draftKey,
    getItemKey,
    focusedIndex,
    slotIndexOf,
    ticketIndexOf,
    count
  }
}

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
  const {
    draftIndex,
    draftKey,
    getItemKey,
    focusedIndex,
    slotIndexOf,
    ticketIndexOf,
    count
  } = useCardSlots(tickets, total, draft, focusedId, keyOf)
  const animateDraftExit = useDraftExit(draft !== null)
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
  const insert = draftIndex < 0 && drag === null ? onInsertAt : undefined
  const visibleDrag = showDropGap ? drag : null
  const gapStart = dropGapTop(
    rows,
    visibleDrag,
    sourceIndex,
    slotIndexOf,
    virtualizer.getTotalSize()
  )
  const offset = (index: number) =>
    boardDropOffset(visibleDrag, index, sourceIndex)
  const stopMotion = Boolean(reducedMotion) || virtualizer.isScrolling
  const listStyle = virtualListStyle(
    virtualizer.getTotalSize(),
    visibleDrag,
    sourceIndex,
    !overflowing && !reducedMotion && animateDraftExit
  )
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
      <ul className="relative w-full overflow-clip" style={listStyle}>
        {gapStart !== null && drag && (
          <BoardDropGap top={gapStart} height={drag.height} />
        )}
        {insert && (
          <InsertGaps rows={rows} loaded={tickets.length} onInsertAt={insert} />
        )}
        {rows.map((row) =>
          row.index === draftIndex && draft !== null ? (
            <DraftSlot
              key={row.key}
              row={row}
              measure={virtualizer.measureElement}
              offset={offset(draftIndex - 0.5)}
              reducedMotion={stopMotion}
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
              offset={offset(ticketIndexOf(row.index))}
              hidden={drag?.id === tickets[ticketIndexOf(row.index)].id}
              reducedMotion={stopMotion}
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
