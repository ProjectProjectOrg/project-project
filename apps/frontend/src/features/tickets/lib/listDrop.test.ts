import {
  EPIC_SECTION_NONE,
  GroupId,
  SPRINT_SECTION_UNSCHEDULED,
  TicketId,
  TicketRank,
  TicketStatus,
  TypeKey
} from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  bulkGapPosition,
  listBulkDrop,
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
  type: TypeKey.make("feat"),
  subTicketCount: 0,
  rank: TicketRank.make("a0"),
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
  parent: { id: ticketId(id), title: id, type: TypeKey.make(type) }
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
    expect(
      sectionEdit(row({ type: TypeKey.make("epic") }), sprint("G-2"))
    ).toBeNull()
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
    expect(
      sectionEdit(row({ type: TypeKey.make("epic") }), under("T-9", "epic"))
    ).toBeNull()
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

describe("listBulkDrop", () => {
  const done: ListDropTarget = { grouping: "status", key: status("done") }
  const column = ["a0", "a1", "a2", "a3"].map((rank, index) => ({
    id: ticketId(`T-${index + 1}`),
    rank: TicketRank.make(rank)
  }))

  it("refuses the drop when any one ticket can't go there", () => {
    expect(
      listBulkDrop(
        [row(), row({ id: ticketId("T-9"), type: "epic", section: "" })],
        sprint("G-2"),
        [],
        null,
        false
      )
    ).toBeNull()
  })

  it("moves the tickets in their current rank order, with one group field for all", () => {
    expect(
      listBulkDrop(
        [
          row({ id: ticketId("T-8"), rank: TicketRank.make("b1") }),
          row({ id: ticketId("T-9"), rank: TicketRank.make("b0"), section: "" })
        ],
        done,
        column,
        null,
        false
      )
    ).toEqual({
      tickets: ["T-9", "T-8"],
      edit: { status: "done" },
      position: null
    })
  })

  it("places the tickets in the gap only with manual ordering", () => {
    const rows = [row({ id: ticketId("T-9"), rank: TicketRank.make("b0") })]
    expect(
      listBulkDrop(rows, done, column, ticketId("T-3"), true)?.position?.to
    ).toEqual({ before: "T-3" })
    expect(
      listBulkDrop(rows, done, column, ticketId("T-3"), false)?.position
    ).toBeNull()
  })
})

describe("bulkGapPosition", () => {
  const column = ["T-1", "T-2", "T-3", "T-4"].map((id) => ({
    id: ticketId(id)
  }))

  it("anchors on the next ticket that stays, or after the last one", () => {
    const moving = [ticketId("T-2"), ticketId("T-3")]
    expect(bulkGapPosition(column, moving, ticketId("T-2"))).toEqual({
      before: "T-4"
    })
    expect(bulkGapPosition(column, moving, "end")).toEqual({ after: "T-4" })
    expect(
      bulkGapPosition(column, [...moving, ticketId("T-4")], ticketId("T-3"))
    ).toEqual({ after: "T-1" })
  })
})
