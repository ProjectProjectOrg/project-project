import {
  EPIC_SECTION_NONE,
  hasSubTickets,
  isEpic,
  SPRINT_SECTION_UNSCHEDULED,
  type EpicSectionKey,
  type SprintSectionKey,
  type Ticket,
  type TicketId,
  type TicketParent,
  type TicketStatus
} from "@pp/shared"

import { boardMove } from "@/features/sprints/lib/boardUtils"

import type { TicketEdit } from "./ticketPatch"

export type ListDropTarget = Readonly<
  | { grouping: "status"; key: TicketStatus }
  | { grouping: "sprint"; key: SprintSectionKey; completed: boolean }
  | { grouping: "parent"; key: EpicSectionKey; parent: TicketParent | null }
>

export type DraggedRow = Pick<Ticket, "id" | "type" | "subTicketCount"> &
  Readonly<{ section: string }>

export type RowGap = TicketId | "end"

export function sectionEdit(
  row: DraggedRow,
  to: ListDropTarget
): TicketEdit | null {
  if (row.section === to.key) return {}
  if (to.grouping === "status") return { status: to.key }
  if (to.grouping === "sprint") {
    if (to.completed) return null
    if (to.key === SPRINT_SECTION_UNSCHEDULED) return { sprint: null }
    return isEpic(row) ? null : { sprint: to.key }
  }
  const { parent } = to
  if (parent === null || to.key === EPIC_SECTION_NONE) return { parent: null }
  if (isEpic(row) || parent.id === row.id) return null
  if (!isEpic(parent) && hasSubTickets(row)) return null
  return { parent }
}

export function movingGap(
  column: ReadonlyArray<Pick<Ticket, "id">>,
  rowId: TicketId,
  gap: RowGap
): RowGap | null {
  const index = column.findIndex((ticket) => ticket.id === rowId)
  if (index < 0) return gap
  const next = column[index + 1]?.id ?? "end"
  return gap === rowId || gap === next ? null : gap
}

export function listDropEdit(
  row: DraggedRow,
  to: ListDropTarget,
  column: ReadonlyArray<Pick<Ticket, "id" | "rank">>,
  gap: RowGap | null,
  ordered: boolean
): TicketEdit | null {
  const edit = sectionEdit(row, to)
  if (edit === null) return null
  const at = ordered && gap !== null ? movingGap(column, row.id, gap) : null
  const position =
    at === null
      ? undefined
      : boardMove(
          column,
          column,
          row.id,
          at === "end"
            ? { type: "column" }
            : { type: "card", id: at, edge: "top" }
        )
  const next = position === undefined ? edit : { ...edit, position }
  return Object.keys(next).length === 0 ? null : next
}
