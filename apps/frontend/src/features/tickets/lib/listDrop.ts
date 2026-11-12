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
  type TicketPosition,
  type TicketRank,
  type TicketStatus
} from "@pp/shared"

import { boardMove } from "@/features/sprints/lib/boardUtils"

import type { TicketEdit } from "./ticketPatch"
import { compareByRank, predictRanks } from "./ticketRank"

export type ListDropTarget = Readonly<
  | { grouping: "status"; key: TicketStatus }
  | { grouping: "sprint"; key: SprintSectionKey; completed: boolean }
  | { grouping: "parent"; key: EpicSectionKey; parent: TicketParent | null }
>

export type DraggedRow = Pick<
  Ticket,
  "id" | "type" | "subTicketCount" | "rank"
> &
  Readonly<{ section: string }>

export type BulkDrop = Readonly<{
  tickets: ReadonlyArray<TicketId>
  edit: TicketEdit
  position: Readonly<{
    to: TicketPosition
    ranks: ReadonlyArray<TicketRank | null>
  }> | null
}>

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

export function groupEdit(
  rows: ReadonlyArray<DraggedRow>,
  to: ListDropTarget
): TicketEdit | null {
  const edits = rows.map((row) => sectionEdit(row, to))
  if (edits.includes(null)) return null
  return (
    edits.find((edit) => edit !== null && Object.keys(edit).length > 0) ?? {}
  )
}

export function bulkGapPosition(
  column: ReadonlyArray<Pick<Ticket, "id">>,
  movingIds: ReadonlyArray<TicketId>,
  gap: RowGap
): TicketPosition | null {
  const stays = (ticket: Pick<Ticket, "id">) => !movingIds.includes(ticket.id)
  const index = gap === "end" ? -1 : column.findIndex(({ id }) => id === gap)
  const next = index < 0 ? undefined : column.slice(index).find(stays)
  if (next !== undefined) return { before: next.id }
  const last = column.findLast(stays)
  return last === undefined ? null : { after: last.id }
}

export function listBulkDrop(
  rows: ReadonlyArray<DraggedRow>,
  to: ListDropTarget,
  column: ReadonlyArray<Pick<Ticket, "id" | "rank">>,
  gap: RowGap | null,
  ordered: boolean
): BulkDrop | null {
  const edit = groupEdit(rows, to)
  if (edit === null) return null
  const tickets = rows.toSorted(compareByRank).map(({ id }) => id)
  const target =
    ordered && gap !== null ? bulkGapPosition(column, tickets, gap) : null
  const position =
    target === null
      ? null
      : {
          to: target,
          ranks:
            predictRanks(column, tickets, target) ?? tickets.map(() => null)
        }
  if (Object.keys(edit).length === 0 && position === null) return null
  return { tickets, edit, position }
}
