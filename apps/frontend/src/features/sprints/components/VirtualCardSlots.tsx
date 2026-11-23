import type { Ticket } from "@pp/shared"
import { boardCardSlotClass, BoardInsertGap } from "@pp/ui/board-column"
import {
  BoardCardMotion,
  boardSlotAttribute,
  type BoardDrag
} from "@pp/ui/board-drag"
import { cn } from "@pp/ui/lib/utils"
import type { Key, ReactNode } from "react"

import { m } from "@/paraglide/messages"

export const ESTIMATED_CARD_HEIGHT = 104

export type Row = Readonly<{ index: number; start: number; key: Key }>

export function InsertGaps({
  rows,
  loaded,
  onInsertAt
}: Readonly<{
  rows: ReadonlyArray<Row>
  loaded: number
  onInsertAt: (index: number) => void
}>) {
  return rows.map((row) =>
    row.index > 0 && row.index < loaded ? (
      <BoardInsertGap
        key={`gap-${String(row.key)}`}
        top={row.start}
        label={m.sprints_board_insert_ticket()}
        onInsert={() => onInsertAt(row.index)}
      />
    ) : null
  )
}

export function DraftSlot({
  row,
  measure,
  offset,
  reducedMotion,
  resetKey,
  children
}: Readonly<{
  row: Row
  measure: (node: HTMLLIElement | null) => void
  offset: number
  reducedMotion: boolean
  resetKey: string
  children: ReactNode
}>) {
  return (
    <li
      ref={measure}
      data-index={row.index}
      className="absolute top-0 left-0 z-20 w-full"
      style={{ transform: `translateY(${row.start}px)` }}
    >
      <BoardCardMotion
        index={row.index}
        start={row.start}
        offset={offset}
        hidden={false}
        reducedMotion={reducedMotion}
        resetKey={resetKey}
      >
        <div className={boardCardSlotClass}>{children}</div>
      </BoardCardMotion>
    </li>
  )
}

export function PlaceholderSlot({ row }: Readonly<{ row: Row }>) {
  return (
    <li
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
  )
}

export function TicketSlot({
  row,
  ticket,
  position,
  size,
  measure,
  offset,
  hidden,
  reducedMotion,
  resetKey,
  onFocus,
  children
}: Readonly<{
  row: Row
  ticket: Ticket
  position: number
  size: number
  measure: (node: HTMLLIElement | null) => void
  offset: number
  hidden: boolean
  reducedMotion: boolean
  resetKey: string
  onFocus: (id: string) => void
  children: (ticket: Ticket) => ReactNode
}>) {
  return (
    <li
      ref={measure}
      aria-setsize={size}
      aria-posinset={position}
      data-index={row.index}
      data-ticket-id={ticket.id}
      {...{ [boardSlotAttribute]: "" }}
      className="absolute top-0 left-0 w-full"
      style={{ transform: `translateY(${row.start}px)` }}
      onFocusCapture={() => onFocus(ticket.id)}
    >
      <BoardCardMotion
        index={row.index}
        start={row.start}
        offset={offset}
        hidden={hidden}
        reducedMotion={reducedMotion}
        resetKey={resetKey}
      >
        {children(ticket)}
      </BoardCardMotion>
    </li>
  )
}

export const dropGapTop = (
  rows: ReadonlyArray<Row>,
  drag: BoardDrag | null,
  sourceIndex: number,
  slotIndexOf: (ticket: number) => number,
  totalSize: number
) => {
  if (drag?.index == null) return null
  const slot = slotIndexOf(drag.index)
  const start = rows.find((row) => row.index === slot)?.start ?? totalSize
  return (
    start - (sourceIndex >= 0 && sourceIndex < drag.index ? drag.height : 0)
  )
}
