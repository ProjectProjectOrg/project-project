import { Ticket, TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { PointedTicket, SelectedTicket } from "./commandMenu"
import { commandTarget, type CommandScope } from "./commandScopes"

const id = Schema.decodeSync(TicketId)

const row = Schema.decodeSync(Ticket)({
  id: "T-3",
  title: "Hovered",
  status: "todo",
  type: null,
  priority: "med",
  rank: "a0",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
})

const pointed: PointedTicket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: row.id,
  row,
  patch: () => {},
  search: undefined
}

const selected = (ticketId: string): SelectedTicket => ({
  ...row,
  id: id(ticketId)
})

const openTicket: CommandScope = {
  ticket: { orgSlug: "acme", slug: "app", ticketId: id("T-1") }
}

describe("commandTarget", () => {
  it("prefers the selection, then the hovered row, then the open ticket", () => {
    const selection: CommandScope = {
      selection: () => ({
        slug: "app",
        tickets: [selected("T-7"), selected("T-8")]
      })
    }

    expect(
      commandTarget("acme", [openTicket, selection], pointed).ticket?.ticketId
    ).toBe("T-7")
    expect(commandTarget("acme", [openTicket], pointed)).toEqual({
      ticket: { orgSlug: "acme", slug: "app", ticketId: row.id },
      selection: []
    })
    expect(commandTarget("acme", [openTicket], null)).toEqual({
      ticket: openTicket.ticket,
      selection: []
    })
  })
})
