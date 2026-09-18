import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { describe, expect, it, vi } from "vitest"
import { Api } from "./Api"
import { Keys, projectScope } from "./keys"
import { stubFetch } from "./testFetch"

const fetch = stubFetch()

describe("Api", () => {
  it("shares one atom and one request between structurally equal queries", async () => {
    const handler = vi.fn(() =>
      Promise.resolve(Response.json({ total: 0, byStatus: {} }))
    )
    fetch.set(handler)
    const request = {
      params: { orgSlug: "acme", slug: "web" },
      query: {},
      reactivityKeys: [Keys.ticketsIn(projectScope("acme", "web"))],
      timeToLive: "2 minutes"
    } as const
    const a = Api.query("tickets", "count", { ...request })
    const b = Api.query("tickets", "count", { ...request })
    expect(a).toBe(b)

    const registry = AtomRegistry.make()
    registry.mount(a)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(a))).toBe(true)
      )
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })
})

describe("keys", () => {
  it("builds project-scoped key strings", () => {
    const scope = projectScope("acme", "web")
    expect(scope).toBe("acme/web")
    expect(Keys.ticketsIn(scope)).toBe("tickets/acme/web")
    expect(Keys.ticketLists(scope)).toBe("ticket-lists/acme/web")
    expect(Keys.ticket(scope, "T-1" as never)).toBe(
      "ticket-content/acme/web/T-1"
    )
  })
})
