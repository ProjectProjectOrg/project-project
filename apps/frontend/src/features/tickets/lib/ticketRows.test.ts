import {
  DEFAULT_TICKET_SORT,
  TicketId,
  TicketRank,
  TicketStatus,
  TypeKey
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Equal from "effect/Equal"
import { describe, expect, it } from "vitest"

import {
  placeCreatedRow,
  placeholderRow,
  viewQuery,
  withoutEpics,
  type QuickCreateInput
} from "./ticketRows"

const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
const todo = TicketStatus.make("todo")

const input = (clientId: string) =>
  ({
    payload: { title: clientId },
    prediction: {
      clientId,
      createdBy: "user-1",
      projectPrefix: "T",
      estimation: "off"
    }
  }) satisfies QuickCreateInput

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

  it("drops unset filters, so the same view built two ways is one cache key", () => {
    expect(
      Equal.equals(
        viewQuery({ sort, estimate: undefined, status: undefined }),
        viewQuery({ sort })
      )
    ).toBe(true)
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

describe("placeCreatedRow", () => {
  const ranked = (id: string, rank: string) => {
    const row = placeholderRow(input(id), [], todo, now)
    return {
      ...row,
      ticket: {
        ...row.ticket,
        id: TicketId.make(id),
        rank: TicketRank.make(rank)
      },
      orderKey: `${rank}\u0000${id}`
    }
  }
  const items = [ranked("T-1", "a0"), ranked("T-2", "a1")]
  const created = placeholderRow(input("new"), items, todo, now)
  const manual = { key: "manual", dir: "asc" } as const

  it("puts a ticket created at a position between its neighbours", () => {
    const placed = placeCreatedRow(
      items,
      created,
      { after: TicketId.make("T-1") },
      manual
    )

    expect(placed.map((row) => row.ticket.id)).toEqual([
      "T-1",
      created.ticket.id,
      "T-2"
    ])
  })

  it("keeps a new ticket on top without a position or a manual order", () => {
    expect(
      placeCreatedRow(items, created, undefined, manual)[0].ticket.id
    ).toBe(created.ticket.id)
    expect(
      placeCreatedRow(
        items,
        created,
        { after: TicketId.make("T-1") },
        { key: "created", dir: "desc" }
      )[0].ticket.id
    ).toBe(created.ticket.id)
  })
})
