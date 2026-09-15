import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_TICKET_SORT,
  Ticket,
  TicketDetail,
  TicketId,
  type TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import {
  backlog,
  backlogRequest,
  encodeTicketListQuery,
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
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Ticket

const encode = Schema.encodeSync(Ticket)
// `tickets.update`'s success schema is `TicketDetail`, so the PATCH mock
// response must decode as one even though the sections view only ever
// reads `Ticket` fields off it.
const encodeUpdateResponse = Schema.encodeSync(TicketDetail)
const asDetail = (t: Ticket): TicketDetail => ({ ...t, body: "Before" })
const req = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })

const sections = (items: ReadonlyArray<Ticket>) =>
  Response.json({
    counts: { total: items.length, byStatus: { todo: items.length } },
    sections: { todo: { items: items.map((t) => encode(t)), nextCursor: null } }
  })

const fetchStub = stubFetch()

describe("backlog optimistic update", () => {
  it("holds the preview until the sections refetch lands", async () => {
    let served: ReadonlyArray<Ticket> = [ticket]
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(sections(served))
    })
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
      finish(Response.json(encodeUpdateResponse(asDetail(confirmed))))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      // Never observed "med" again between paint and settle.
      expect(settled.value.sections.todo.items[0].ticket.priority).toBe("high")
    } finally {
      registry.dispose()
    }
  })

  it("reverts the row when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(sections([ticket]))
    })
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
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
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
      expect(moved.value.counts.byStatus[ticket.status]).toBe(0)
      expect(moved.value.counts.byStatus[doing]).toBe(1)
      expect(moved.value.counts.total).toBe(1)

      finish(
        Response.json(
          encodeUpdateResponse(asDetail({ ...ticket, status: doing }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("composes two stacked status moves out of `current`, not the original server value", async () => {
    const inProgress = Schema.decodeSync(TicketStatus)("in_progress")
    const doneStatus = Schema.decodeSync(TicketStatus)("done")
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(
        Response.json({
          counts: { total: 1, byStatus: { todo: 1, in_progress: 0, done: 0 } },
          sections: {
            todo: { items: [encode(ticket)], nextCursor: null },
            in_progress: { items: [], nextCursor: null },
            done: { items: [], nextCursor: null }
          }
        })
      )
    })
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

      // Fire the second move while the first is still in flight, so the
      // second reducer call runs against whatever `current` holds at that
      // point rather than the original fetched value.
      registry.set(mutation, { status: inProgress })
      registry.set(mutation, { status: doneStatus })

      const composed = registry.get(view)
      if (!AsyncResult.isSuccess(composed))
        throw new Error("no optimistic value")
      expect(composed.waiting).toBe(true)
      expect(composed.value.sections.todo.items).toHaveLength(0)
      expect(composed.value.sections.in_progress.items).toHaveLength(0)
      expect(composed.value.sections.done.items).toHaveLength(1)
      expect(composed.value.sections.done.items[0].ticket.id).toBe(ticket.id)
      // `in_progress` was entered and left within the same batch — assert the
      // observed count directly (0) rather than trusting the `Math.max(0, ...)`
      // guard not to have been needed.
      expect(composed.value.counts.byStatus[ticket.status]).toBe(0)
      expect(composed.value.counts.byStatus[inProgress]).toBe(0)
      expect(composed.value.counts.byStatus[doneStatus]).toBe(1)
      expect(composed.value.counts.total).toBe(1)

      finish(
        Response.json(
          encodeUpdateResponse(asDetail({ ...ticket, status: doneStatus }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("carries a stacked field edit through a subsequent status move", async () => {
    // A reducer that stopped deriving from `current` (e.g. re-read the
    // original fetch instead) would apply the status move to the
    // pre-priority-edit ticket and silently drop the priority change.
    const doing = Schema.decodeSync(TicketStatus)("in_progress")
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
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
      registry.set(mutation, { status: doing })

      const composed = registry.get(view)
      if (!AsyncResult.isSuccess(composed))
        throw new Error("no optimistic value")
      expect(composed.value.sections.todo.items).toHaveLength(0)
      expect(composed.value.sections.in_progress.items[0].ticket.priority).toBe(
        "high"
      )

      finish(new Response("nope", { status: 500 }))
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
    fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
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
      finish(
        Response.json(
          encodeUpdateResponse(asDetail({ ...ticket, priority: "high" }))
        )
      )
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

  it("does not drop the optimistic overlay early when a load-more page has not settled yet", async () => {
    let finishPatch = (_r: Response) => {}
    fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finishPatch = resolve
        })
      }
      if (url.pathname.endsWith("/sections")) {
        return Promise.resolve(
          Response.json({
            counts: { total: 1, byStatus: { todo: 1 } },
            sections: {
              todo: { items: [encode(ticket)], nextCursor: "cursor-1" }
            }
          })
        )
      }
      // The load-more page request never resolves.
      return new Promise<Response>(() => {})
    })
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    const loadMore = loadMoreBacklog({ req, status: "todo" })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(loadMore, undefined)
      await vi.waitFor(() => expect(registry.get(loadMore).waiting).toBe(false))

      registry.set(mutation, { priority: "high" })
      finishPatch(
        Response.json(
          encodeUpdateResponse(asDetail({ ...ticket, priority: "high" }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      // Give the commit-refresh a chance to run; the pending page must keep
      // the view waiting rather than settling on an incomplete value.
      await Effect.runPromise(Effect.sleep("50 millis"))
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: true
      })
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
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(sections(served))
    })
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
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value.sections.todo.items[0]).toMatchObject({
        key: "creation-1",
        pending: true
      })

      served = [created, ticket]
      finish(Response.json(encodeUpdateResponse(asDetail(created))))
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
  it("removes the optimistic row and restores the counts when creation fails", async () => {
    let finish = (_r: Response) => {}
    // The sections refetch is made to hang after the initial load, so the row
    // can only disappear by the overlay being dropped, never by server truth
    // arriving. A commit path would leave the row on screen, waiting.
    let stallReads = false
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      if (stallReads) return new Promise<Response>(() => {})
      return Promise.resolve(sections([ticket]))
    })
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
      const before = registry.get(view)
      if (!AsyncResult.isSuccess(before)) throw new Error("no server value")
      expect(before.value.sections.todo.items).toHaveLength(1)
      expect(before.value.counts).toEqual({ total: 1, byStatus: { todo: 1 } })

      stallReads = true
      registry.set(create, {
        ticket: { title: "Doomed", status: ticket.status },
        viewerId: "user-1",
        projectPrefix: "T",
        clientId: "creation-doomed"
      })

      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value.sections.todo.items[0]).toMatchObject({
        key: "creation-doomed",
        pending: true
      })
      expect(optimistic.value.counts).toEqual({
        total: 2,
        byStatus: { todo: 2 }
      })

      finish(new Response("nope", { status: 500 }))
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(
        settled.value.sections.todo.items.map(({ key, pending }) => ({
          key,
          pending
        }))
      ).toEqual([{ key: "T-1", pending: false }])
      expect(
        settled.value.sections.todo.items.some(
          (row) => row.key === "creation-doomed"
        )
      ).toBe(false)
      expect(
        settled.value.sections.todo.items.some(
          (row) => row.ticket.title === "Doomed"
        )
      ).toBe(false)
      expect(settled.value.counts).toEqual({ total: 1, byStatus: { todo: 1 } })
      expect(settled.waiting).toBe(false)
    } finally {
      registry.dispose()
    }
  })
})

describe("encodeTicketListQuery", () => {
  it("canonicalizes structurally equal queries regardless of key order", () => {
    const a: TicketListQuery = {
      archived: false,
      sort: { key: "updated", dir: "desc" },
      q: "foo"
    }
    const b: TicketListQuery = {
      q: "foo",
      sort: { dir: "desc", key: "updated" },
      archived: false
    }
    expect(encodeTicketListQuery(a)).toBe(encodeTicketListQuery(b))
  })

  it("still distinguishes queries that actually differ", () => {
    const a: TicketListQuery = { sort: { key: "updated", dir: "desc" } }
    const b: TicketListQuery = { sort: { key: "created", dir: "desc" } }
    expect(encodeTicketListQuery(a)).not.toBe(encodeTicketListQuery(b))
  })
})

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const withTicket = (id: string, fields: Partial<Ticket>): Ticket => ({
  ...ticket,
  id: Schema.decodeSync(TicketId)(id),
  ...fields
})

const todoStatus = Schema.decodeSync(TicketStatus)("todo")
const inProgressStatus = Schema.decodeSync(TicketStatus)("in_progress")

const orderAfterRoundTrip = async (
  query: TicketListQuery,
  items: ReadonlyArray<Ticket>,
  movedId: TicketId
): Promise<ReadonlyArray<string>> => {
  const pending: Array<(r: Response) => void> = []
  fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return new Promise<Response>((resolve) => {
        pending.push(resolve)
      })
    }
    return Promise.resolve(
      Response.json({
        counts: {
          total: items.length,
          byStatus: { todo: items.length, in_progress: 0 }
        },
        sections: {
          todo: { items: items.map((t) => encode(t)), nextCursor: null },
          in_progress: { items: [], nextCursor: null }
        }
      })
    )
  })
  const request = backlogRequest("acme", "web", query)
  const registry = AtomRegistry.make()
  const view = backlog(request)
  const mutation = updateBacklogTicket({ req: request, id: movedId })
  registry.mount(view)
  registry.mount(mutation)
  try {
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
    )
    registry.set(mutation, { status: inProgressStatus })
    registry.set(mutation, { status: todoStatus })

    const optimistic = registry.get(view)
    if (!AsyncResult.isSuccess(optimistic)) {
      throw new Error("no optimistic value")
    }
    const order = optimistic.value.sections.todo.items.map(
      (row) => row.ticket.id
    )
    const back = items.find((t) => t.id === movedId)!
    for (const resolve of pending) {
      resolve(Response.json(encodeUpdateResponse(asDetail(back))))
    }
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    return order
  } finally {
    registry.dispose()
  }
}

describe("backlog status round trip keeps the section's sort order", () => {
  it("returns the oldest row to the bottom under the default `created desc` sort", async () => {
    const items = [
      withTicket("T-1", {
        title: "Alpha",
        createdAt: at("2026-03-01T00:00:00.000Z")
      }),
      withTicket("T-2", {
        title: "Beta",
        createdAt: at("2026-02-01T00:00:00.000Z")
      }),
      withTicket("T-3", {
        title: "Gamma",
        createdAt: at("2026-01-01T00:00:00.000Z")
      })
    ]
    const order = await orderAfterRoundTrip(
      { sort: DEFAULT_TICKET_SORT },
      items,
      items[2].id
    )
    expect(order).toEqual(["T-1", "T-2", "T-3"])
  })

  it("returns the row to its alphabetical place under `title asc`", async () => {
    const items = [
      withTicket("T-1", {
        title: "Alpha",
        createdAt: at("2026-01-01T00:00:00.000Z")
      }),
      withTicket("T-2", {
        title: "Beta",
        createdAt: at("2026-05-01T00:00:00.000Z")
      }),
      withTicket("T-3", {
        title: "Gamma",
        createdAt: at("2026-02-01T00:00:00.000Z")
      })
    ]
    const order = await orderAfterRoundTrip(
      { sort: { key: "title", dir: "asc" } },
      items,
      items[1].id
    )
    expect(order).toEqual(["T-1", "T-2", "T-3"])
  })

  it("puts the row at the top under `updated desc`, because the patch bumps updatedAt the way the server does", async () => {
    const items = [
      withTicket("T-1", {
        title: "Alpha",
        updatedAt: at("2026-03-01T00:00:00.000Z")
      }),
      withTicket("T-2", {
        title: "Beta",
        updatedAt: at("2026-02-01T00:00:00.000Z")
      }),
      withTicket("T-3", {
        title: "Gamma",
        updatedAt: at("2026-01-01T00:00:00.000Z")
      })
    ]
    const order = await orderAfterRoundTrip(
      { sort: { key: "updated", dir: "desc" } },
      items,
      items[2].id
    )
    expect(order).toEqual(["T-3", "T-1", "T-2"])
  })
})
