import { it } from "@effect/vitest"
import { PROJECT_IMPORT_MAX_BYTES, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { describe, expect, vi } from "vitest"

import { Api, uploadProjectArchive } from "./Api"
import { Keys, projectScope } from "./keys"
import { stubFetch, type FetchHandler } from "./testFetch"

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
      reactivityKeys: [Keys.ticketLists(projectScope("acme", "web"))],
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

it.effect("rejects oversized project exports before sending their bytes", () =>
  Effect.gen(function* () {
    const handler = vi.fn<FetchHandler>()
    fetch.set(handler)
    const file = new File([], "project.tar.gz")
    Object.defineProperty(file, "size", { value: PROJECT_IMPORT_MAX_BYTES + 1 })
    const error = yield* Effect.flip(
      uploadProjectArchive({ orgSlug: "acme", file })
    )
    expect(error).toMatchObject({
      _tag: "ProjectImportInvalid",
      kind: "archive_too_large"
    })
    expect(handler).not.toHaveBeenCalled()
  })
)

describe("keys", () => {
  it("builds project-scoped key strings", () => {
    const scope = projectScope("acme", "web")
    expect(scope).toBe("acme/web")
    expect(Keys.ticketLists(scope)).toBe("ticket-lists/acme/web")
    expect(Keys.ticket(scope, TicketId.make("T-1"))).toBe(
      "ticket-content/acme/web/T-1"
    )
  })
})
