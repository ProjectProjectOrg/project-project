import type { BoardDrag } from "@pp/ui/board-drag"
import type { Key } from "react"

export const ESTIMATED_CARD_HEIGHT = 104

export type Row = Readonly<{ index: number; start: number; key: Key }>

export const draftSlots = (draftIndex: number) => ({
  ticketIndexOf: (slot: number) =>
    draftIndex >= 0 && slot > draftIndex ? slot - 1 : slot,
  slotIndexOf: (ticket: number) =>
    draftIndex >= 0 && ticket >= draftIndex ? ticket + 1 : ticket
})

export const withKeptIndexes = (
  indexes: Array<number>,
  kept: ReadonlyArray<number>
) => {
  const present = new Set(indexes)
  const missing = kept.filter((index) => index >= 0 && !present.has(index))
  return missing.length > 0
    ? [...indexes, ...missing].toSorted((a, b) => a - b)
    : indexes
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
