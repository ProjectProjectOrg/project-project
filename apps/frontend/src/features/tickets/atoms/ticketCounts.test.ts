import { TicketListQuery } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { countsRequest, ticketCounts } from "./ticketCounts"

const fetchStub = stubFetch()

describe("ticketCounts", () => {
  it("reads the counts endpoint and shares structurally equal requests", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(Response.json({ total: 3, byStatus: { todo: 3 } }))
    )
    fetchStub.set(fetchSpy)
    const a = countsRequest("acme", "web", {})
    const b = countsRequest("acme", "web", {})
    expect(ticketCounts(a)).toBe(ticketCounts(b))

    const registry = AtomRegistry.make()
    const view = ticketCounts(a)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value.total).toBe(3)
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })
})

const decodeQuery = Schema.decodeSync(TicketListQuery)

it("shares the count atom across ordering, cursor, and view changes", () => {
  const first = decodeQuery({
    sort: { key: "title", dir: "asc" },
    type: ["bug"]
  })
  const next = {
    ...first,
    sort: { key: "priority", dir: "desc" } as const,
    cursor: "next-page",
    view: "board"
  }
  const firstRequest = countsRequest("org", "project", first)
  const nextRequest = countsRequest("org", "project", next)
  expect(ticketCounts(nextRequest)).toBe(ticketCounts(firstRequest))
  expect(nextRequest.query).toEqual({ type: ["bug"] })
})

it("preserves count filters, dates, and project scope in the atom identity", () => {
  const query = decodeQuery({
    q: "needle",
    type: ["bug"],
    status: ["todo"],
    assignee: ["mine"],
    groupId: ["ungrouped"],
    tags: ["urgent"],
    archived: true,
    hasBranch: true,
    hasPr: false,
    updatedAfter: "2026-09-01T00:00:00.000Z"
  })
  const { sort: _sort, ...filters } = query
  const req = countsRequest("org", "project", query)
  expect(req.query).toEqual(filters)
  expect(req.query.updatedAfter).toEqual(query.updatedAfter)
  expect(
    ticketCounts(countsRequest("org", "project", { ...query, q: "different" }))
  ).not.toBe(ticketCounts(req))
  expect(ticketCounts(countsRequest("org", "another", query))).not.toBe(
    ticketCounts(req)
  )
})
