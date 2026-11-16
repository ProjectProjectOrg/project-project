import type { NodeKey } from "lexical"

import type { BlockPlacement } from "./blockCommands"

export type DragSlot = Readonly<{ key: NodeKey; top: number; height: number }>

export type DragLayout = Readonly<{
  shifts: ReadonlyMap<NodeKey, number>
  ghostTop: number
}>

export type DropPlacement = Readonly<{
  key: NodeKey
  placement: BlockPlacement
}>

const pitch = (slots: ReadonlyArray<DragSlot>, index: number): number => {
  const slot = slots[index]
  const next = slots.at(index + 1)
  if (next !== undefined) return next.top - slot.top
  const previous = index === 0 ? undefined : slots[index - 1]
  const gap =
    previous === undefined ? 0 : slot.top - previous.top - previous.height
  return slot.height + gap
}

export const isNoopInsertion = (dragIndex: number, index: number): boolean =>
  index === dragIndex || index === dragIndex + 1

export const insertionIndexAt = (
  slots: ReadonlyArray<DragSlot>,
  dragIndex: number,
  y: number
): number => {
  const passed = slots.filter(
    (slot, index) => index !== dragIndex && y > slot.top + slot.height / 2
  ).length
  return passed < dragIndex ? passed : passed + 1
}

export const dragLayout = (
  slots: ReadonlyArray<DragSlot>,
  dragIndex: number,
  index: number
): DragLayout => {
  const dragged = slots[dragIndex]
  if (isNoopInsertion(dragIndex, index))
    return { shifts: new Map(), ghostTop: dragged.top }
  const distance = pitch(slots, dragIndex)
  const down = index > dragIndex
  const moved = down
    ? slots.slice(dragIndex + 1, index)
    : slots.slice(index, dragIndex)
  const ghostTop = down
    ? slots[index - 1].top + pitch(slots, index - 1) - distance
    : slots[index].top
  const shifts = new Map<NodeKey, number>(
    moved.map((slot) => [slot.key, down ? -distance : distance])
  )
  shifts.set(dragged.key, ghostTop - dragged.top)
  return { shifts, ghostTop }
}

export const dropPlacement = (
  slots: ReadonlyArray<DragSlot>,
  dragIndex: number,
  index: number
): DropPlacement | null => {
  if (isNoopInsertion(dragIndex, index)) return null
  const below = slots.at(index)
  if (below !== undefined) return { key: below.key, placement: "before" }
  const last = slots.at(-1)
  return last === undefined ? null : { key: last.key, placement: "after" }
}
