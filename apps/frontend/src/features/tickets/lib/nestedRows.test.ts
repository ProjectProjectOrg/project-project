import { TicketId, TicketStatus, type Ticket } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { withoutNestedChildren } from "./nestedRows"

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

const parentOf = (id: string, type: Ticket["type"]) => ({
  id: ticketId(id),
  title: id,
  type
})

describe("withoutNestedChildren", () => {
  it("drops children whose ticket parent is present, keeps epic children and orphans", () => {
    const tickets = [
      ticket("T-1", { type: "epic" }),
      ticket("T-2", { parent: parentOf("T-1", "epic") }),
      ticket("T-3", { parent: parentOf("T-2", "feat") }),
      ticket("T-4", { parent: parentOf("T-9", "feat") })
    ]
    expect(withoutNestedChildren(tickets).map(({ id }) => id)).toEqual([
      "T-1",
      "T-2",
      "T-4"
    ])
  })
})
