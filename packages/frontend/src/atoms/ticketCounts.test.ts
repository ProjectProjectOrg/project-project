import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, describe, expect, it, vi } from "vitest"
import { countsRequest, ticketCounts } from "./ticketCounts"

afterEach(() => vi.unstubAllGlobals())

describe("ticketCounts", () => {
  it("reads the counts endpoint and shares structurally equal requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(Response.json({ total: 3, byStatus: { todo: 3 } }))
      )
    )
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
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })
})
