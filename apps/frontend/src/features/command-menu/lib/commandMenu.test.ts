import { TicketId, TicketStatus } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  actOnTicket,
  backCommandMenu,
  currentCommandPage,
  deselectFromCommandMenu,
  openCommandMenu,
  pushCommandPage
} from "./commandMenu"

const decodeTicketId = Schema.decodeSync(TicketId)
const decodeStatus = Schema.decodeSync(TicketStatus)

const ticket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: Schema.decodeSync(TicketId)("T-1")
}

const other = { ...ticket, ticketId: Schema.decodeSync(TicketId)("T-5") }

describe("backCommandMenu", () => {
  it("steps back through pages, then to the root, then out of the ticket", () => {
    const opened = openCommandMenu(ticket, "ticketStatus")
    const deeper = pushCommandPage(opened, "ticketAssignee")

    const one = backCommandMenu(deeper)
    expect(currentCommandPage(one)).toBe("ticketStatus")
    const root = backCommandMenu(one)
    expect(currentCommandPage(root)).toBe("root")
    expect(root.ticket).toBe(ticket)
    const global = backCommandMenu(root)
    expect(global.ticket).toBeNull()
    expect(backCommandMenu(global)).toBe(global)
  })

  it("returns to the search and row a step was taken from", () => {
    const picked = actOnTicket(openCommandMenu(null), ticket, {
      search: "align",
      value: "open-ticket:T-1"
    })
    const status = pushCommandPage(picked, "ticketStatus", {
      search: "sta",
      value: "ticket.status"
    })
    const root = backCommandMenu(status)
    expect(root).toMatchObject({
      ticket,
      search: "sta",
      focus: "ticket.status"
    })
    expect(backCommandMenu(root)).toMatchObject({
      ticket: null,
      search: "align",
      focus: "open-ticket:T-1"
    })
  })

  it("returns to the ticket in context before acting on a search result", () => {
    const picked = actOnTicket(openCommandMenu(ticket), other, {
      search: "foo",
      value: "open-ticket:T-5"
    })
    const back = backCommandMenu(picked)
    expect(back).toMatchObject({
      ticket,
      pages: ["root"],
      search: "foo",
      focus: "open-ticket:T-5"
    })
    expect(backCommandMenu(back).ticket).toBeNull()
  })
})

const selected = (id: string) => ({
  id: decodeTicketId(id),
  title: id,
  status: decodeStatus("todo"),
  priority: "med" as const,
  type: "feat" as const,
  estimate: null,
  tags: [],
  assignees: []
})

describe("deselectFromCommandMenu", () => {
  it("drops a ticket and falls back to one ticket when one is left", () => {
    const opened = openCommandMenu(ticket, "ticketSprint", [
      selected("T-1"),
      selected("T-2"),
      selected("T-3")
    ])
    const two = deselectFromCommandMenu(opened, selected("T-3").id)
    expect(two.selection.map((each) => each.id)).toEqual(["T-1", "T-2"])

    const one = deselectFromCommandMenu(two, selected("T-1").id)
    expect(one.selection).toEqual([])
    expect(one.ticket?.ticketId).toBe("T-2")
    expect(currentCommandPage(one)).toBe("ticketSprint")
  })

  it("opens single-ticket pages on the ticket alone", () => {
    const opened = openCommandMenu(ticket, "ticketMove", [
      selected("T-1"),
      selected("T-2")
    ])
    expect(opened.selection).toEqual([])
  })
})
