import {
  EPIC_SECTION_NONE,
  hasSubTickets,
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

export type RowAnchor = Readonly<{ id: TicketId; edge: "top" | "bottom" }>

export function sectionEdit(
  row: DraggedRow,
  to: ListDropTarget
): TicketEdit | null {
  if (row.section === to.key) return {}
  if (to.grouping === "status") return { status: to.key }
  if (to.grouping === "sprint") {
    if (to.completed) return null
    if (to.key === SPRINT_SECTION_UNSCHEDULED) return { sprint: null }
    return row.type === "epic" ? null : { sprint: to.key }
  }
  const { parent } = to
  if (parent === null || to.key === EPIC_SECTION_NONE) return { parent: null }
  if (row.type === "epic" || parent.id === row.id) return null
  if (parent.type !== "epic" && hasSubTickets(row)) return null
  return { parent }
}

export function listDropEdit(
  row: DraggedRow,
  to: ListDropTarget,
  column: ReadonlyArray<Pick<Ticket, "id" | "rank">>,
  anchor: RowAnchor | null,
  ordered: boolean
): TicketEdit | null {
  const edit = sectionEdit(row, to)
  if (edit === null) return null
  const position =
    ordered && anchor !== null && anchor.id !== row.id
      ? boardMove(column, column, row.id, { type: "card", ...anchor })
      : undefined
  const next = position === undefined ? edit : { ...edit, position }
  return Object.keys(next).length === 0 ? null : next
}
