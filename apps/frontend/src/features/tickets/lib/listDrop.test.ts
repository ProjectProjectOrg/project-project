import {
  EPIC_SECTION_NONE,
  GroupId,
  SPRINT_SECTION_UNSCHEDULED,
  TicketId,
  TicketRank,
  TicketStatus
} from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  listDropEdit,
  movingGap,
  sectionEdit,
  type DraggedRow,
  type ListDropTarget
} from "./listDrop"

const ticketId = Schema.decodeSync(TicketId)
const groupId = Schema.decodeSync(GroupId)
const status = Schema.decodeSync(TicketStatus)

const row = (fields: Partial<DraggedRow> = {}): DraggedRow => ({
  id: ticketId("T-1"),
  type: "feat",
  subTicketCount: 0,
  section: "todo",
  ...fields
})

const sprint = (id: string, completed = false): ListDropTarget => ({
  grouping: "sprint",
  key: groupId(id),
  completed
})

const under = (id: string, type: "epic" | "feat"): ListDropTarget => ({
  grouping: "parent",
  key: ticketId(id),
  parent: { id: ticketId(id), title: id, type }
})

describe("sectionEdit", () => {
  it("changes no field when the row stays in its own section", () => {
    expect(
      sectionEdit(row(), { grouping: "status", key: status("todo") })
    ).toEqual({})
  })

  it("sets the status or sprint of the section it lands in, and the backlog clears the sprint", () => {
    expect(
      sectionEdit(row(), { grouping: "status", key: status("done") })
    ).toEqual({ status: "done" })
    expect(sectionEdit(row(), sprint("G-2"))).toEqual({ sprint: "G-2" })
    expect(
      sectionEdit(row({ section: "G-2" }), {
        grouping: "sprint",
        key: SPRINT_SECTION_UNSCHEDULED,
        completed: false
      })
    ).toEqual({ sprint: null })
  })

  it("refuses a completed sprint, and an epic in any sprint", () => {
    expect(sectionEdit(row(), sprint("G-2", true))).toBeNull()
    expect(sectionEdit(row({ type: "epic" }), sprint("G-2"))).toBeNull()
  })

  it("sets the parent of the section it lands in, and the no-parent section clears it", () => {
    expect(sectionEdit(row(), under("T-9", "epic"))).toMatchObject({
      parent: { id: "T-9" }
    })
    expect(
      sectionEdit(row({ section: "T-9" }), {
        grouping: "parent",
        key: EPIC_SECTION_NONE,
        parent: null
      })
    ).toEqual({ parent: null })
  })

  it("keeps the epic > ticket > sub-ticket hierarchy", () => {
    expect(sectionEdit(row({ type: "epic" }), under("T-9", "epic"))).toBeNull()
    expect(sectionEdit(row(), under("T-1", "feat"))).toBeNull()
    expect(
      sectionEdit(row({ subTicketCount: 2 }), under("T-9", "feat"))
    ).toBeNull()
    expect(
      sectionEdit(row({ subTicketCount: 2 }), under("T-9", "epic"))
    ).not.toBeNull()
  })
})

describe("movingGap", () => {
  const column = [
    { id: ticketId("T-1") },
    { id: ticketId("T-2") },
    { id: ticketId("T-3") }
  ]

  it("hides the gaps on either side of the dragged row, which move nothing", () => {
    expect(movingGap(column, ticketId("T-2"), ticketId("T-2"))).toBeNull()
    expect(movingGap(column, ticketId("T-2"), ticketId("T-3"))).toBeNull()
    expect(movingGap(column, ticketId("T-3"), "end")).toBeNull()
    expect(movingGap(column, ticketId("T-3"), ticketId("T-1"))).toBe("T-1")
    expect(movingGap(column, ticketId("T-9"), ticketId("T-2"))).toBe("T-2")
  })
})

describe("listDropEdit", () => {
  const column = [
    { id: ticketId("T-2"), rank: TicketRank.make("a0") },
    { id: ticketId("T-3"), rank: TicketRank.make("a1") }
  ]
  const done: ListDropTarget = { grouping: "status", key: status("done") }

  it("places the row in the gap only with manual ordering", () => {
    expect(
      listDropEdit(row(), done, column, ticketId("T-3"), true)
    ).toMatchObject({ status: "done", position: { to: { before: "T-3" } } })
    expect(listDropEdit(row(), done, column, "end", true)).toMatchObject({
      position: { to: { after: "T-3" } }
    })
    expect(listDropEdit(row(), done, column, ticketId("T-3"), false)).toEqual({
      status: "done"
    })
  })

  it("does nothing when the drop changes neither section nor position", () => {
    expect(
      listDropEdit(row({ section: "done" }), done, column, null, true)
    ).toBeNull()
  })
})
