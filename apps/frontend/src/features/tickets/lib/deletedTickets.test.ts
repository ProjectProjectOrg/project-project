import { TicketId } from "@pp/shared"
import { makeTicket } from "@pp/shared/tickets/testing"
import { expect, it } from "vitest"

import { deletedTicketIds } from "./deletedTickets"

it("only cascades through descendants of the selected ticket, regardless of row order", () => {
  const root = makeTicket()
  const child = makeTicket({ id: TicketId.make("T-2"), parent: root })
  const grandchild = makeTicket({ id: TicketId.make("T-3"), parent: child })
  const other = makeTicket({ id: TicketId.make("T-4") })
  const rows = [grandchild, child, other]
  expect(deletedTicketIds(rows, { tickets: [root.id] })).toEqual(
    new Set([root.id])
  )
  expect(
    deletedTicketIds(rows, { tickets: [root.id], cascadeSubTickets: true })
  ).toEqual(new Set([root.id, child.id, grandchild.id]))
})
