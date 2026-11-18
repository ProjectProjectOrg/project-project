import { TicketId } from "@pp/shared"
import { makeTicket } from "@pp/shared/tickets/testing"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { PointedTicket, SelectedTicket } from "./commandMenu"
import { commandTarget, type CommandScope } from "./commandScopes"

const id = Schema.decodeSync(TicketId)

const row = makeTicket({ id: id("T-3") })

const pointed: PointedTicket = {
  orgSlug: "acme",
  slug: "app",
  ticketId: row.id,
  row,
  patch: () => {},
  search: undefined
}

const selected = (ticketId: string) =>
  ({
    ...row,
    id: id(ticketId)
  }) satisfies SelectedTicket

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
