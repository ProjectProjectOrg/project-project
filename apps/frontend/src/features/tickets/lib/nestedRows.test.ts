import { TicketId, TicketStatus, type Ticket } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { withExpandedChildren, withoutNestedChildren } from "./nestedRows"
import type { TicketRow } from "./ticketRows"

const ticketId = Schema.decodeSync(TicketId)
const todo = Schema.decodeSync(TicketStatus)("todo")
const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z"))

const ticket = (id: string, fields: Partial<Ticket> = {}): Ticket => ({
  id: ticketId(id),
  title: id,
  status: todo,
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  estimate: null,
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: now,
  updatedAt: now,
  ...fields
})

const row = (id: string, fields: Partial<Ticket> = {}): TicketRow => ({
  ticket: ticket(id, fields),
  key: id,
  orderKey: id,
  pending: false
})

const keys = (entries: ReturnType<typeof withExpandedChildren>) =>
  entries.map(({ key }) => key)

describe("withExpandedChildren", () => {
  const rows = [row("T-1"), row("T-2")]
  const children = [row("T-3", { parent: ticketId("T-1") })]

  it("inserts loaded children right after their expanded parent", () => {
    const entries = withExpandedChildren(rows, new Set([ticketId("T-1")]), () =>
      AsyncResult.success(children)
    )
    expect(keys(entries)).toEqual(["T-1", "T-1/T-3", "T-2"])
    expect(entries[1]).toMatchObject({ parent: "T-1", last: true })
  })

  it("marks an expanded parent's children as loading or failed", () => {
    const expanded = new Set([ticketId("T-1")])
    const loading = withExpandedChildren(rows, expanded, () => undefined)
    const failed = withExpandedChildren(rows, expanded, () =>
      AsyncResult.fail("boom")
    )
    expect(loading[1]).toMatchObject({ kind: "children", state: "loading" })
    expect(failed[1]).toMatchObject({ kind: "children", state: "failed" })
  })

  it("reserves a loading row per known sub-ticket", () => {
    const parent = row("T-1", { subTicketCount: 3 })
    const entries = withExpandedChildren(
      [parent],
      new Set([ticketId("T-1")]),
      () => undefined
    )
    expect(entries.slice(1).map(({ kind, last }) => ({ kind, last }))).toEqual([
      { kind: "children", last: false },
      { kind: "children", last: false },
      { kind: "children", last: true }
    ])
  })

  it("leaves collapsed parents alone", () => {
    expect(
      keys(withExpandedChildren(rows, new Set(), () => undefined))
    ).toEqual(["T-1", "T-2"])
  })
})

describe("withoutNestedChildren", () => {
  it("drops children whose ticket parent is present, keeps epic children and orphans", () => {
    const tickets = [
      ticket("T-1", { type: "epic" }),
      ticket("T-2", { parent: ticketId("T-1") }),
      ticket("T-3", { parent: ticketId("T-2") }),
      ticket("T-4", { parent: ticketId("T-9") })
    ]
    expect(withoutNestedChildren(tickets).map(({ id }) => id)).toEqual([
      "T-1",
      "T-2",
      "T-4"
    ])
  })
})
