import { it } from "@effect/vitest"
import { TicketDetail, TicketId, TicketUpdateResult } from "@pp/shared"
import { makeTicketDetail } from "@pp/shared/tickets/testing"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { ticketActivity, ticketActivityRequest } from "./ticketActivity"
import { ticketRequest, updateTicketDetail } from "./ticketDetail"

const encodeTicketUpdateResultSync = Schema.encodeSync(TicketUpdateResult)

const encodeTicketDetailSync = Schema.encodeSync(TicketDetail)

const fetchStub = stubFetch()
const ticketId = Schema.decodeSync(TicketId)("T-1")
const req = ticketActivityRequest("acme", "web", ticketId)
const ticket = makeTicketDetail()

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
  it("loads every page behind the cursor", async () => {
    const fetched: Array<string | null> = []
    serve(fetched)
    const registry = AtomRegistry.make()
    registry.mount(ticketActivity(req))
    try {
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

  it.live("refetches once after overlapping ticket edits settle", () =>
    Effect.gen(function* () {
      const fetched: Array<string | null> = []
      const releases: Array<() => void> = []
      let writes = 0
      fetchStub.set(async (input, init) => {
        if (init?.method === "PATCH") {
          writes += 1
          await new Promise<void>((resolve) => releases.push(resolve))
          return Promise.resolve(
            Response.json(
              encodeTicketUpdateResultSync({
                ticket: {
                  ...ticket,
                  body: writes === 1 ? "After" : ticket.body
                },
                orderKey: null
              })
            )
          )
        }
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost"
        )
        if (!url.pathname.endsWith("/activity")) {
          return Promise.resolve(Response.json(encodeTicketDetailSync(ticket)))
        }
        fetched.push(url.searchParams.get("cursor"))
        return Promise.resolve(
          Response.json({ items: [], people: [], nextCursor: null })
        )
      })
      const registry = AtomRegistry.make()
      const update = updateTicketDetail(ticketRequest("acme", "web", ticketId))
      registry.mount(ticketActivity(req))
      registry.mount(update)
      try {
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(fetched).toEqual([null]))
        )
        registry.set(update, { body: "After" })
        yield* Effect.promise(() => vi.waitFor(() => expect(writes).toBe(1)))
        registry.set(update, { body: ticket.body })
        releases.shift()?.()
        yield* Effect.promise(() => vi.waitFor(() => expect(writes).toBe(2)))
        yield* Effect.sleep(450)
        expect(fetched).toEqual([null])
        releases.shift()?.()
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(fetched).toEqual([null, null]))
        )
      } finally {
        for (const release of releases) release()
        registry.dispose()
      }
    })
  )
})
