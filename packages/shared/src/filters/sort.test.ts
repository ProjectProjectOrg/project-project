import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"
import { ticketComparator, type SortableTicket } from "./sort"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const ticket = (fields: Partial<SortableTicket>): SortableTicket => ({
  id: "T-1",
  title: "Alpha",
  priority: "med",
  createdAt: at("2026-01-01T00:00:00.000Z"),
  updatedAt: at("2026-01-01T00:00:00.000Z"),
  ...fields
})

const order = (
  tickets: ReadonlyArray<SortableTicket>,
  sort: Parameters<typeof ticketComparator>[0]
) => tickets.toSorted(ticketComparator(sort)).map((t) => t.id)

describe("ticketComparator", () => {
  it("orders ids numerically, not lexically", () => {
    const tickets = [
      ticket({ id: "T-10" }),
      ticket({ id: "T-2" }),
      ticket({ id: "T-1" })
    ]
    expect(order(tickets, { key: "id", dir: "asc" })).toEqual([
      "T-1",
      "T-2",
      "T-10"
    ])
  })

  it("ranks priority high over med over low", () => {
    const tickets = [
      ticket({ id: "T-1", priority: "low" }),
      ticket({ id: "T-2", priority: "high" }),
      ticket({ id: "T-3", priority: "med" })
    ]
    expect(order(tickets, { key: "priority", dir: "desc" })).toEqual([
      "T-2",
      "T-3",
      "T-1"
    ])
  })

  it("compares titles case-insensitively", () => {
    const tickets = [
      ticket({ id: "T-1", title: "beta" }),
      ticket({ id: "T-2", title: "Alpha" })
    ]
    expect(order(tickets, { key: "title", dir: "asc" })).toEqual(["T-2", "T-1"])
  })

  it("breaks ties on the raw ticket id ascending, whichever way the sort runs", () => {
    const tie = at("2026-02-02T00:00:00.000Z")
    const tickets = [
      ticket({ id: "T-2", createdAt: tie }),
      ticket({ id: "T-1", createdAt: tie }),
      ticket({ id: "T-10", createdAt: tie })
    ]
    expect(order(tickets, { key: "created", dir: "desc" })).toEqual([
      "T-1",
      "T-10",
      "T-2"
    ])
    expect(order(tickets, { key: "created", dir: "asc" })).toEqual([
      "T-1",
      "T-10",
      "T-2"
    ])
  })
})
