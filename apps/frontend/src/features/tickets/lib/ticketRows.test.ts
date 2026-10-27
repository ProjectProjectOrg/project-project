import { TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { placeholderRow, type QuickCreateInput } from "./ticketRows"

const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
const todo = TicketStatus.make("todo")

const input = (clientId: string): QuickCreateInput => ({
  payload: { title: clientId },
  prediction: {
    clientId,
    createdBy: "user-1",
    projectPrefix: "T",
    estimation: "off"
  }
})

describe("placeholderRow", () => {
  it("gives stacked creations in one section distinct placeholder ids", () => {
    const first = placeholderRow(input("a"), [], todo, now)
    const second = placeholderRow(input("b"), [first], todo, now)
    const third = placeholderRow(input("c"), [second, first], todo, now)

    expect([first, second, third].map((row) => row.ticket.id)).toEqual([
      "T-999999",
      "T-1000000",
      "T-1000001"
    ])
    expect([first, second, third].map((row) => row.key)).toEqual([
      "a",
      "b",
      "c"
    ])
  })
})
