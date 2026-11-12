import { DEFAULT_TICKET_SORT, TicketStatus, TypeKey } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  placeholderRow,
  viewQuery,
  withoutEpics,
  type QuickCreateInput
} from "./ticketRows"

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

describe("viewQuery", () => {
  const sort = DEFAULT_TICKET_SORT

  it("leaves epics out by excluding the epic type, so custom types stay in", () => {
    expect(viewQuery({ sort, view: "board" })).toEqual({
      sort,
      excludeType: ["epic"]
    })
  })

  it("keeps a chosen type filter as the include list", () => {
    const type = [TypeKey.make("incident-lite"), TypeKey.make("epic")]
    expect(viewQuery({ sort, type })).toEqual({ sort, type })
  })

  it("adds the epic exclusion next to a chosen filter once", () => {
    const type = [TypeKey.make("bug")]
    const query = withoutEpics({ sort, type, excludeType: ["none" as const] })
    expect(query).toEqual({ sort, type, excludeType: ["none", "epic"] })
    expect(withoutEpics(query)).toBe(query)
  })
})
