import { TicketId, TicketStatus, type Ticket } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { attachCandidates } from "./childTickets"

const ticketId = Schema.decodeSync(TicketId)
const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z"))

const ticket = (id: string, fields: Partial<Ticket> = {}): Ticket => ({
  id: ticketId(id),
  title: id,
  status: Schema.decodeSync(TicketStatus)("todo"),
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

const ids = (tickets: ReadonlyArray<Ticket>) => tickets.map(({ id }) => id)

describe("attachCandidates", () => {
  const search = [
    ticket("T-1"),
    ticket("T-2", { type: "epic" }),
    ticket("T-3", { parent: ticketId("T-1") }),
    ticket("T-4", { subTicketCount: 2 }),
    ticket("T-5", { parent: ticketId("T-2") })
  ]

  it("offers a ticket only leaf tickets that aren't already its children", () => {
    expect(ids(attachCandidates(search, ticket("T-1")))).toEqual(["T-5"])
  })

  it("lets an epic take tickets that have sub-tickets", () => {
    expect(
      ids(attachCandidates(search, ticket("T-2", { type: "epic" })))
    ).toEqual(["T-1", "T-3", "T-4"])
  })
})
