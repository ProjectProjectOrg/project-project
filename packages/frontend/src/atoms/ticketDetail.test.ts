import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TicketDetail, TicketId, TicketStatus } from "@projectproject/shared"
import { ticketDetail, ticketRequest, updateTicketDetail } from "./ticketDetail"

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "Before"
} satisfies TicketDetail

const encode = Schema.encodeSync(TicketDetail)
const req = ticketRequest("acme", "web", ticket.id)

afterEach(() => vi.unstubAllGlobals())

describe("ticket detail optimistic update", () => {
  it("paints instantly, holds until the refetch lands, then shows server truth", async () => {
    let served = ticket
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json(encode(served)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(updateTicketDetail(req), { priority: "high" })
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { priority: "high" }
      })

      served = ticket
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      const confirmed = {
        ...ticket,
        priority: "high" as const,
        title: "Renamed by server"
      }
      served = confirmed
      finish(Response.json(encode(confirmed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.priority).toBe("high")
      expect(settled.value.title).toBe("Renamed by server")
    } finally {
      registry.dispose()
    }
  })

  it("rolls back when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json(encode(ticket)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(updateTicketDetail(req), { priority: "high" })
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      finish(new Response("nope", { status: 500 }))

      await vi.waitFor(() =>
        expect(registry.get(updateTicketDetail(req)).waiting).toBe(false)
      )
      expect(registry.get(view)).toMatchObject({ value: { priority: "med" } })
    } finally {
      registry.dispose()
    }
  })

  it("stacks two rapid edits", async () => {
    const pending: Array<(r: Response) => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => pending.push(resolve))
        }
        return Promise.resolve(Response.json(encode(ticket)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(updateTicketDetail(req), { priority: "high" })
      registry.set(updateTicketDetail(req), { type: "bug" })
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: "bug" }
      })
    } finally {
      registry.dispose()
    }
  })
})
