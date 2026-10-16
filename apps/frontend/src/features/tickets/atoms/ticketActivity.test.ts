import {
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketUpdateResult
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  olderActivityPages,
  ticketActivity,
  ticketActivityRequest
} from "./ticketActivity"
import { ticketRequest, updateTicketDetail } from "./ticketDetail"

const fetchStub = stubFetch()
const ticketId = Schema.decodeSync(TicketId)("T-1")
const req = ticketActivityRequest("acme", "web", ticketId)
const created = DateTime.toDate(DateTime.makeUnsafe("2026-10-16T09:00:00.000Z"))
const ticket = {
  id: ticketId,
  title: "Ticket",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  estimate: null,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: created,
  updatedAt: created,
  creator: null,
  updater: null,
  body: "Before"
} satisfies TicketDetail

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

  it("refetches after the ticket page saves an edit", async () => {
    const fetched: Array<string | null> = []
    fetchStub.set((input, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(
          Response.json(
            Schema.encodeSync(TicketUpdateResult)({
              ticket: { ...ticket, body: "After" },
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
        return Promise.resolve(
          Response.json(Schema.encodeSync(TicketDetail)(ticket))
        )
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
      await vi.waitFor(() => expect(fetched).toEqual([null]))
      registry.set(update, { body: "After" })
      await vi.waitFor(() => expect(fetched).toEqual([null, null]))
    } finally {
      registry.dispose()
    }
  })
})
