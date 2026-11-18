import { TicketId, type Ticket, TypeKey } from "@pp/shared"
import { makeTicket } from "@pp/shared/tickets/testing"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { withoutNestedChildren } from "./nestedRows"

const ticketId = Schema.decodeSync(TicketId)

const ticket = (id: string, fields: Partial<Ticket> = {}) =>
  makeTicket({ id: ticketId(id), type: TypeKey.make("feat"), ...fields })

const parentOf = (id: string, type: Ticket["type"]) => ({
  id: ticketId(id),
  title: id,
  type
})

describe("withoutNestedChildren", () => {
  it("drops children whose ticket parent is present, keeps epic children and orphans", () => {
    const tickets = [
      ticket("T-1", { type: TypeKey.make("epic") }),
      ticket("T-2", { parent: parentOf("T-1", TypeKey.make("epic")) }),
      ticket("T-3", { parent: parentOf("T-2", TypeKey.make("feat")) }),
      ticket("T-4", { parent: parentOf("T-9", TypeKey.make("feat")) })
    ]
    expect(withoutNestedChildren(tickets).map(({ id }) => id)).toEqual([
      "T-1",
      "T-2",
      "T-4"
    ])
  })
})
