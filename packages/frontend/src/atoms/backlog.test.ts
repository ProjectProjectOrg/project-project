import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TicketDetail, TicketId, TicketStatus } from "@projectproject/shared"
import {
  backlog,
  backlogRequest,
  loadMoreBacklog,
  quickCreateBacklogTicket,
  updateBacklogTicket
} from "./backlog"

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
const req = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })

const sections = (items: ReadonlyArray<TicketDetail>) =>
  Response.json({
    counts: { total: items.length, byStatus: { todo: items.length } },
    sections: { todo: { items: items.map(encode), nextCursor: null } }
  })

afterEach(() => vi.unstubAllGlobals())

describe("backlog optimistic update", () => {
  it("holds the preview until the sections refetch lands", async () => {
    let served = [ticket]
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections(served))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { priority: "high" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.sections.todo.items[0].ticket.priority).toBe(
        "high"
      )

      const confirmed = { ...ticket, priority: "high" as const }
      served = [confirmed]
      finish(Response.json(encode(confirmed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.sections.todo.items[0].ticket.priority).toBe("high")
    } finally {
      registry.dispose()
    }
  })

  it("reverts the row when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections([ticket]))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { priority: "high" })
      finish(new Response("nope", { status: 500 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.sections.todo.items[0].ticket.priority).toBe("med")
    } finally {
      registry.dispose()
    }
  })

  it("shares one atom between structurally equal requests", () => {
    const a = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })
    const b = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })
    expect(backlog(a)).toBe(backlog(b))
  })
})

describe("backlog status move", () => {
  it("moves the row between sections and adjusts counts", async () => {
    const doing = Schema.decodeSync(TicketStatus)("in_progress")
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(
          Response.json({
            counts: { total: 1, byStatus: { todo: 1, in_progress: 0 } },
            sections: {
              todo: { items: [encode(ticket)], nextCursor: null },
              in_progress: { items: [], nextCursor: null }
            }
          })
        )
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { status: doing })

      const moved = registry.get(view)
      if (!AsyncResult.isSuccess(moved)) throw new Error("no optimistic value")
      expect(moved.value.sections.todo.items).toHaveLength(0)
      expect(moved.value.sections.in_progress.items[0].ticket.id).toBe(
        ticket.id
      )
      expect(moved.value.counts.byStatus.todo).toBe(0)
      expect(moved.value.counts.byStatus.in_progress).toBe(1)
      expect(moved.value.counts.total).toBe(1)

      finish(Response.json(encode({ ...ticket, status: doing })))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

describe("backlog pagination", () => {
  it("keeps loaded pages across an optimistic commit refresh", async () => {
    const second = { ...ticket, id: Schema.decodeSync(TicketId)("T-2") }
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        )
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        if (url.pathname.endsWith("/sections")) {
          return Promise.resolve(
            Response.json({
              counts: { total: 2, byStatus: { todo: 2 } },
              sections: {
                todo: { items: [encode(ticket)], nextCursor: "cursor-1" }
              }
            })
          )
        }
        return Promise.resolve(
          Response.json({ items: [encode(second)], nextCursor: null })
        )
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(loadMoreBacklog({ req, status: "todo" }), undefined)
      await vi.waitFor(() => {
        const loaded = registry.get(view)
        if (!AsyncResult.isSuccess(loaded)) throw new Error("not loaded")
        expect(loaded.value.sections.todo.items).toHaveLength(2)
      })

      registry.set(mutation, { priority: "high" })
      finish(Response.json(encode({ ...ticket, priority: "high" })))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.sections.todo.items.map((r) => r.ticket.id)).toEqual(
        ["T-1", "T-2"]
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("backlog quick create", () => {
  it("keeps the caller's row key when the server row arrives", async () => {
    const created = {
      ...ticket,
      id: Schema.decodeSync(TicketId)("T-9"),
      title: "Created"
    }
    let served = [ticket]
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections(served))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const create = quickCreateBacklogTicket(req)
    registry.mount(view)
    registry.mount(create)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(create, {
        ticket: { title: "Created", status: ticket.status },
        viewerId: "user-1",
        projectPrefix: "T",
        clientId: "creation-1"
      })

      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(optimistic.value.sections.todo.items[0]).toMatchObject({
        key: "creation-1",
        pending: true
      })

      served = [created, ticket]
      finish(Response.json(encode(created)))
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(
        settled.value.sections.todo.items.map(({ key, pending }) => ({
          key,
          pending
        }))
      ).toEqual([
        { key: "creation-1", pending: false },
        { key: "T-1", pending: false }
      ])
    } finally {
      registry.dispose()
    }
  })
})
