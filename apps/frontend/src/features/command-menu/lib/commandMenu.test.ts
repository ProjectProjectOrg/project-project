import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  actOnTicket,
  backCommandMenu,
  currentCommandPage,
  openCommandMenu,
  pushCommandPage
} from "./commandMenu"

const ticket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: Schema.decodeSync(TicketId)("T-1")
}

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
})
