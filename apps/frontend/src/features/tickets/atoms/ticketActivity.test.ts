import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { describe, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"

import {
  olderActivityPages,
  ticketActivity,
  ticketActivityRequest
} from "./ticketActivity"

const fetchStub = stubFetch()
const ticketId = Schema.decodeSync(TicketId)("T-1")
const req = ticketActivityRequest("acme", "web", ticketId)

const entry = (id: string) => ({
  kind: "change",
  id,
  occurredAt: "2026-10-16T09:00:00.000Z",
  actor: { kind: "system", source: "github" },
  cause: null,
  change: { kind: "description_edited" }
})

const serve = (fetched: Array<string | null>) =>
  fetchStub.set((input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    const cursor = url.searchParams.get("cursor")
    fetched.push(cursor)
    return Promise.resolve(
      Response.json(
        cursor === null
          ? { items: [entry("newest")], people: [], nextCursor: "older" }
          : { items: [entry("oldest")], people: [], nextCursor: null }
      )
    )
  })

const ids = (registry: AtomRegistry.AtomRegistry) => {
  const result = registry.get(ticketActivity(req))
  return AsyncResult.isSuccess(result)
    ? {
        ids: result.value.items.map((item) => item.id),
        hasOlder: result.value.hasOlder
      }
    : null
}

describe("ticketActivity", () => {
  it("appends older pages behind the cursor", async () => {
    const fetched: Array<string | null> = []
    serve(fetched)
    const registry = AtomRegistry.make()
    registry.mount(ticketActivity(req))
    try {
      await vi.waitFor(() =>
        expect(ids(registry)).toEqual({ ids: ["newest"], hasOlder: true })
      )
      registry.set(olderActivityPages(req), 1)
      await vi.waitFor(() =>
        expect(ids(registry)).toEqual({
          ids: ["newest", "oldest"],
          hasOlder: false
        })
      )
      expect(fetched).toEqual([null, "older"])
    } finally {
      registry.dispose()
    }
  })

  it("refetches when another view publishes the ticket's key", async () => {
    const fetched: Array<string | null> = []
    serve(fetched)
    const registry = AtomRegistry.make()
    const publish = Api.runtime.fn(() =>
      Reactivity.invalidate([
        Keys.ticket(projectScope("acme", "web"), ticketId)
      ])
    )
    registry.mount(ticketActivity(req))
    registry.mount(publish)
    try {
      await vi.waitFor(() => expect(fetched).toEqual([null]))
      registry.set(publish, undefined)
      await vi.waitFor(() => expect(fetched).toEqual([null, null]))
    } finally {
      registry.dispose()
    }
  })

  it("surfaces a failed older page and loads it again on refresh", async () => {
    const fetched: Array<string | null> = []
    let olderFails = true
    fetchStub.set((input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      const cursor = url.searchParams.get("cursor")
      fetched.push(cursor)
      if (cursor === null) {
        return Promise.resolve(
          Response.json({
            items: [entry("newest")],
            people: [],
            nextCursor: "older"
          })
        )
      }
      return Promise.resolve(
        olderFails
          ? Response.json({ _tag: "NotFound" }, { status: 404 })
          : Response.json({
              items: [entry("oldest")],
              people: [],
              nextCursor: null
            })
      )
    })
    const registry = AtomRegistry.make()
    registry.mount(ticketActivity(req))
    try {
      await vi.waitFor(() =>
        expect(ids(registry)).toEqual({ ids: ["newest"], hasOlder: true })
      )
      registry.set(olderActivityPages(req), 1)
      await vi.waitFor(() =>
        expect(registry.get(ticketActivity(req))._tag).toBe("Failure")
      )

      olderFails = false
      registry.refresh(ticketActivity(req))
      await vi.waitFor(() =>
        expect(ids(registry)).toEqual({
          ids: ["newest", "oldest"],
          hasOlder: false
        })
      )
    } finally {
      registry.dispose()
    }
  })
})
