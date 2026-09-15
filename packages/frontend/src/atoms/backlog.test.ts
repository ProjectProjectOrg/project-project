import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_TICKET_SORT,
  padNumericIdSort,
  Ticket,
  TicketDetail,
  TicketId,
  type TicketListQuery,
  TicketStatus,
  TicketUpdateResult,
  UpdateTicketInput
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
import { applyTicketPatch } from "./ticketPatch"

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
const encodeDetail = Schema.encodeSync(TicketDetail)
const encodeUpdateResponse = Schema.encodeSync(TicketUpdateResult)
const asDetail = (t: Ticket): TicketDetail => ({ ...t, body: "Before" })
const asUpdateResult = (
  t: Ticket,
  key: string | null = null
): TicketUpdateResult => ({ ticket: asDetail(t), orderKey: key })
const req = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })

const orderKey = (sortValue: string, id: string) => `${sortValue}\u0000${id}`

const idKey = (t: Ticket) => orderKey(padNumericIdSort(t.id) ?? t.id, t.id)

const createdKey = (t: Ticket) => orderKey(t.createdAt.toISOString(), t.id)

const updatedKey = (t: Ticket) => orderKey(t.updatedAt.toISOString(), t.id)

const titleKey = (t: Ticket) => orderKey(t.title.toLowerCase(), t.id)

const serverRow = (t: Ticket, key: string = idKey(t)) => ({
  ticket: encode(t),
  orderKey: key
})

const sections = (items: ReadonlyArray<Ticket>) =>
  Response.json({
    counts: { total: items.length, byStatus: { todo: items.length } },
    sections: {
      todo: { items: items.map((t) => serverRow(t)), nextCursor: null }
    }
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
      finish(Response.json(encodeUpdateResponse(asUpdateResult(confirmed))))

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

  it("merges a canceled rapid edit into the surviving request", async () => {
    const bodies: Array<UpdateTicketInput> = []
    const pending: Array<(response: Response) => void> = []
    fetchStub.set(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        bodies.push(
          Schema.decodeUnknownSync(UpdateTicketInput)(
            await new Response(init.body).json()
          )
        )
        return new Promise<Response>((resolve) => pending.push(resolve))
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
      await vi.waitFor(() => expect(bodies).toHaveLength(1))
      registry.set(mutation, { type: "bug" })
      await vi.waitFor(() => expect(bodies).toHaveLength(2))
      expect(bodies[1]).toEqual({ priority: "high", type: "bug" })

      pending[1]!(
        Response.json(
          encodeUpdateResponse(
            asUpdateResult({ ...ticket, priority: "high", type: "bug" })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("keeps another pending row ordered when one response lands", async () => {
    const alpha = withTicket("T-1", { title: "Alpha" })
    const beta = withTicket("T-2", { title: "Beta" })
    const gamma = withTicket("T-3", { title: "Gamma" })
    let served = [alpha, beta, gamma]
    const pending = new Map<string, (response: Response) => void>()
    fetchStub.set(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = Schema.decodeUnknownSync(UpdateTicketInput)(
          await new Response(init.body).json()
        )
        return new Promise<Response>((resolve) =>
          pending.set(body.title ?? "", resolve)
        )
      }
      return Promise.resolve(
        Response.json({
          counts: { total: 3, byStatus: { todo: 3 } },
          sections: {
            todo: {
              items: served.map((row) => serverRow(row, titleKey(row))),
              nextCursor: null
            }
          }
        })
      )
    })
    const request = backlogRequest("acme", "web", {
      sort: { key: "title", dir: "asc" }
    })
    const registry = AtomRegistry.make()
    const view = backlog(request)
    const alphaMutation = updateBacklogTicket({ req: request, id: alpha.id })
    const betaMutation = updateBacklogTicket({ req: request, id: beta.id })
    registry.mount(view)
    registry.mount(alphaMutation)
    registry.mount(betaMutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(alphaMutation, { title: "Zulu" })
      registry.set(betaMutation, { priority: "high" })
      await vi.waitFor(() => {
        expect(pending.has("Zulu")).toBe(true)
        expect(pending.has("")).toBe(true)
      })
      const pendingOrder = registry.get(view)
      if (!AsyncResult.isSuccess(pendingOrder))
        throw new Error("no pending view")
      expect(
        pendingOrder.value.sections.todo.items.map(({ ticket }) => ticket.id)
      ).toEqual(["T-2", "T-3", "T-1"])
      served = [alpha, { ...beta, priority: "high" }, gamma]
      pending.get("")!(
        Response.json(
          encodeUpdateResponse(
            asUpdateResult({ ...beta, priority: "high" }, titleKey(beta))
          )
        )
      )
      await vi.waitFor(() =>
        expect(registry.get(betaMutation).waiting).toBe(false)
      )
      const afterBeta = registry.get(view)
      if (!AsyncResult.isSuccess(afterBeta)) throw new Error("no beta view")
      expect(
        afterBeta.value.sections.todo.items.map(({ ticket }) => ticket.id)
      ).toEqual(["T-2", "T-3", "T-1"])
      served = [
        { ...beta, priority: "high" },
        gamma,
        { ...alpha, title: "Zulu" }
      ]
      pending.get("Zulu")!(
        Response.json(
          encodeUpdateResponse(
            asUpdateResult(
              { ...alpha, title: "Zulu" },
              titleKey({ ...alpha, title: "Zulu" })
            )
          )
        )
      )
      await vi.waitFor(() =>
        expect(registry.get(alphaMutation).waiting).toBe(false)
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("no settled view")
      expect(
        settled.value.sections.todo.items.map(({ ticket }) => ticket.id)
      ).toEqual(["T-2", "T-3", "T-1"])
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
            todo: { items: [serverRow(ticket)], nextCursor: null },
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
          encodeUpdateResponse(asUpdateResult({ ...ticket, status: doing }))
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
            todo: { items: [serverRow(ticket)], nextCursor: null },
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
          encodeUpdateResponse(
            asUpdateResult({ ...ticket, status: doneStatus })
          )
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
            todo: { items: [serverRow(ticket)], nextCursor: null },
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
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
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
              todo: { items: [serverRow(ticket)], nextCursor: "cursor-1" }
            }
          })
        )
      }
      return Promise.resolve(
        Response.json({ items: [serverRow(second)], nextCursor: null })
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
          encodeUpdateResponse(asUpdateResult({ ...ticket, priority: "high" }))
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
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
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
              todo: { items: [serverRow(ticket)], nextCursor: "cursor-1" }
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
          encodeUpdateResponse(asUpdateResult({ ...ticket, priority: "high" }))
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

  it("surfaces a failed page and retries the same cursor", async () => {
    let pageAttempts = 0
    fetchStub.set((input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith("/sections")) {
        return Promise.resolve(
          Response.json({
            counts: { total: 2, byStatus: { todo: 2 } },
            sections: {
              todo: { items: [serverRow(ticket)], nextCursor: "cursor-1" }
            }
          })
        )
      }
      pageAttempts++
      if (pageAttempts === 1)
        return Promise.resolve(new Response("nope", { status: 500 }))
      return Promise.resolve(
        Response.json({
          items: [
            serverRow({ ...ticket, id: Schema.decodeSync(TicketId)("T-2") })
          ],
          nextCursor: null
        })
      )
    })
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const loadMore = loadMoreBacklog({ req, status: "todo" })
    registry.mount(view)
    registry.mount(loadMore)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(loadMore, undefined)
      await vi.waitFor(() =>
        expect(registry.get(loadMore)).toMatchObject({
          _tag: "Failure",
          waiting: false
        })
      )
      expect(registry.get(view)).toMatchObject({
        value: { sections: { todo: { nextCursor: "cursor-1" } } }
      })

      registry.set(loadMore, undefined)
      await vi.waitFor(() =>
        expect(registry.get(loadMore)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      expect(pageAttempts).toBe(2)
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("no view")
        expect(
          result.value.sections.todo.items.map(({ ticket }) => ticket.id)
        ).toEqual(["T-1", "T-2"])
      })
    } finally {
      registry.dispose()
    }
  })

  it("regenerates loaded cursor pages after the first page boundary moves", async () => {
    const all = Array.from({ length: 100 }, (_, index) =>
      withTicket(`T-${index + 1}`, {
        title: String(index + 1).padStart(3, "0")
      })
    )
    const moved = withTicket("T-70", { title: "000" })
    let sectionsCalls = 0
    const requestedCursors: Array<string | null> = []
    fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (init?.method === "PATCH") {
        return Promise.resolve(
          Response.json(
            encodeUpdateResponse(asUpdateResult(moved, titleKey(moved)))
          )
        )
      }
      if (url.pathname.endsWith("/sections")) {
        sectionsCalls++
        const first =
          sectionsCalls === 1 ? all.slice(0, 50) : [moved, ...all.slice(0, 49)]
        return Promise.resolve(
          Response.json({
            counts: { total: 100, byStatus: { todo: 100 } },
            sections: {
              todo: {
                items: first.map((row) => serverRow(row, titleKey(row))),
                nextCursor: sectionsCalls === 1 ? "cursor-50" : "cursor-49"
              }
            }
          })
        )
      }
      const cursor = url.searchParams.get("cursor")
      requestedCursors.push(cursor)
      const page =
        cursor === "cursor-50"
          ? all.slice(50)
          : [...all.slice(49, 69), ...all.slice(70)]
      return Promise.resolve(
        Response.json({
          items: page.map((row) => serverRow(row, titleKey(row))),
          nextCursor: null
        })
      )
    })
    const request = backlogRequest("acme", "web", {
      sort: { key: "title", dir: "asc" }
    })
    const registry = AtomRegistry.make()
    const view = backlog(request)
    const loadMore = loadMoreBacklog({ req: request, status: "todo" })
    const mutation = updateBacklogTicket({ req: request, id: moved.id })
    registry.mount(view)
    registry.mount(loadMore)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(loadMore, undefined)
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("no view")
        expect(result.value.sections.todo.items).toHaveLength(100)
      })

      registry.set(mutation, { title: "000" })
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result) || result.waiting)
          throw new Error("view is still refreshing")
        const ids = result.value.sections.todo.items.map(
          ({ ticket }) => ticket.id
        )
        expect(ids).toHaveLength(100)
        expect(ids).toContain("T-50")
        expect(ids).toContain("T-70")
      })
      expect(requestedCursors).toContain("cursor-49")
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
      finish(Response.json(encodeDetail(asDetail(created))))
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

  it("refreshes retained sibling sort variants after creation", async () => {
    const created = {
      ...ticket,
      id: Schema.decodeSync(TicketId)("T-9"),
      title: "Created"
    }
    let createdVisible = false
    fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        createdVisible = true
        return Promise.resolve(Response.json(encodeDetail(asDetail(created))))
      }
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      const query = url.searchParams.get("q")
      const visible =
        createdVisible &&
        (query === null ||
          created.title.toLowerCase().includes(query.toLowerCase()))
      return Promise.resolve(visible ? sections([created]) : sections([]))
    })
    const titleRequest = backlogRequest("acme", "web", {
      sort: { key: "title", dir: "asc" }
    })
    const idRequest = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" }
    })
    const matchingRequest = backlogRequest("acme", "web", {
      q: "Created",
      sort: { key: "title", dir: "asc" }
    })
    const nonmatchingRequest = backlogRequest("acme", "web", {
      q: "Other",
      sort: { key: "title", dir: "asc" }
    })
    const registry = AtomRegistry.make()
    const titleView = backlog(titleRequest)
    const idView = backlog(idRequest)
    const matchingView = backlog(matchingRequest)
    const nonmatchingView = backlog(nonmatchingRequest)
    const create = quickCreateBacklogTicket(titleRequest)
    registry.mount(titleView)
    const stopIdView = registry.mount(idView)
    registry.mount(matchingView)
    registry.mount(nonmatchingView)
    registry.mount(create)
    try {
      await vi.waitFor(() => {
        expect(registry.get(titleView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(idView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(matchingView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(nonmatchingView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      })
      stopIdView()
      registry.set(create, {
        ticket: { title: created.title, status: ticket.status },
        viewerId: "user-1",
        projectPrefix: "T",
        clientId: "creation-sibling"
      })
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))
      registry.mount(idView)
      await vi.waitFor(() => {
        const titleResult = registry.get(titleView)
        const idResult = registry.get(idView)
        const matchingResult = registry.get(matchingView)
        const nonmatchingResult = registry.get(nonmatchingView)
        if (!AsyncResult.isSuccess(titleResult) || titleResult.waiting)
          throw new Error("title view is still refreshing")
        if (!AsyncResult.isSuccess(idResult) || idResult.waiting)
          throw new Error("id view is still refreshing")
        if (!AsyncResult.isSuccess(matchingResult) || matchingResult.waiting)
          throw new Error("matching view is still refreshing")
        if (
          !AsyncResult.isSuccess(nonmatchingResult) ||
          nonmatchingResult.waiting
        )
          throw new Error("nonmatching view is still refreshing")
        expect(titleResult.value.sections.todo.items[0]?.key).toBe(
          "creation-sibling"
        )
        expect(idResult.value.sections.todo.items[0]?.ticket.id).toBe("T-9")
        expect(matchingResult.value.sections.todo.items[0]?.ticket.id).toBe(
          "T-9"
        )
        expect(nonmatchingResult.value.sections.todo.items).toHaveLength(0)
        expect(idResult.value.counts.total).toBe(1)
        expect(matchingResult.value.counts.total).toBe(1)
        expect(nonmatchingResult.value.counts.total).toBe(0)
      })
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

type ServedRow = readonly [Ticket, string]

const orderAfterRoundTrip = async (
  query: TicketListQuery,
  items: ReadonlyArray<ServedRow>,
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
          todo: {
            items: items.map(([t, key]) => serverRow(t, key)),
            nextCursor: null
          },
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
    const back = items.find(([t]) => t.id === movedId)!
    for (const resolve of pending) {
      resolve(Response.json(encodeUpdateResponse(asUpdateResult(back[0]))))
    }
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    return order
  } finally {
    registry.dispose()
  }
}

const createdRow = (t: Ticket): ServedRow => [t, createdKey(t)]

const updatedRow = (t: Ticket): ServedRow => [t, updatedKey(t)]

const titleRow = (t: Ticket): ServedRow => [t, titleKey(t)]

const idRow = (t: Ticket): ServedRow => [t, idKey(t)]

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
      items.map(createdRow),
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
      items.map(titleRow),
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
      items.map(updatedRow),
      items[2].id
    )
    expect(order).toEqual(["T-3", "T-1", "T-2"])
  })

  it("inserts the returning row at its exact place under `id asc`", async () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      withTicket(`T-${index + 1}`, { title: `Row ${index + 1}` })
    )
    const order = await orderAfterRoundTrip(
      { sort: { key: "id", dir: "asc" } },
      items.map(idRow),
      items[3].id
    )
    expect(order).toEqual(["T-1", "T-2", "T-3", "T-4", "T-5", "T-6", "T-7"])
  })

  it("inserts the returning row at its exact place under `id desc`", async () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      withTicket(`T-${7 - index}`, { title: `Row ${7 - index}` })
    )
    const order = await orderAfterRoundTrip(
      { sort: { key: "id", dir: "desc" } },
      items.map(idRow),
      items[3].id
    )
    expect(order).toEqual(["T-7", "T-6", "T-5", "T-4", "T-3", "T-2", "T-1"])
  })

  it("puts the row at the bottom under `updated asc`, where the server's bump sends it", async () => {
    const items = [
      withTicket("T-1", {
        title: "Alpha",
        updatedAt: at("2026-01-01T00:00:00.000Z")
      }),
      withTicket("T-2", {
        title: "Beta",
        updatedAt: at("2026-02-01T00:00:00.000Z")
      }),
      withTicket("T-3", {
        title: "Gamma",
        updatedAt: at("2026-03-01T00:00:00.000Z")
      })
    ]
    const order = await orderAfterRoundTrip(
      { sort: { key: "updated", dir: "asc" } },
      items.map(updatedRow),
      items[0].id
    )
    expect(order).toEqual(["T-2", "T-3", "T-1"])
  })
})

describe("backlog status move places the row inside the target section", () => {
  it("lands between the target section's rows under `title asc`", async () => {
    const beta = withTicket("T-2", { title: "Beta" })
    const alpha = withTicket("T-1", {
      title: "Alpha",
      status: inProgressStatus
    })
    const gamma = withTicket("T-3", {
      title: "Gamma",
      status: inProgressStatus
    })
    let finish = (_r: Response) => {}
    fetchStub.set((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(
        Response.json({
          counts: { total: 3, byStatus: { todo: 1, in_progress: 2 } },
          sections: {
            todo: {
              items: [beta].map((t) => serverRow(t, titleKey(t))),
              nextCursor: null
            },
            in_progress: {
              items: [alpha, gamma].map((t) => serverRow(t, titleKey(t))),
              nextCursor: null
            }
          }
        })
      )
    })
    const request = backlogRequest("acme", "web", {
      sort: { key: "title", dir: "asc" }
    })
    const registry = AtomRegistry.make()
    const view = backlog(request)
    const mutation = updateBacklogTicket({ req: request, id: beta.id })
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

      const moved = registry.get(view)
      if (!AsyncResult.isSuccess(moved)) throw new Error("no optimistic value")
      expect(
        moved.value.sections.in_progress.items.map((row) => row.ticket.id)
      ).toEqual(["T-1", "T-2", "T-3"])

      finish(
        Response.json(
          encodeUpdateResponse(
            asUpdateResult({ ...beta, status: inProgressStatus })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

const PRIORITY_SORT_VALUE = { high: "03", med: "02", low: "01" } as const

const priorityKey = (t: Ticket) =>
  orderKey(PRIORITY_SORT_VALUE[t.priority], t.id)

const priorityRow = (t: Ticket): ServedRow => [t, priorityKey(t)]

type EditOutcome = Readonly<{
  optimistic: ReadonlyArray<string>
  settled: ReadonlyArray<string>
  patchUrl: URL
}>

const orderAfterFieldEdit = async (
  query: TicketListQuery,
  items: ReadonlyArray<ServedRow>,
  editedId: TicketId,
  patch: UpdateTicketInput,
  response: (edited: Ticket) => TicketUpdateResult
): Promise<EditOutcome> => {
  let sectionsServed = 0
  let finish = (_r: Response) => {}
  let patchUrl: URL | undefined
  fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patchUrl = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    }
    sectionsServed++
    if (sectionsServed > 1) return new Promise<Response>(() => {})
    return Promise.resolve(
      Response.json({
        counts: { total: items.length, byStatus: { todo: items.length } },
        sections: {
          todo: {
            items: items.map(([t, key]) => serverRow(t, key)),
            nextCursor: null
          }
        }
      })
    )
  })
  const request = backlogRequest("acme", "web", query)
  const registry = AtomRegistry.make()
  const view = backlog(request)
  const mutation = updateBacklogTicket({ req: request, id: editedId })
  registry.mount(view)
  registry.mount(mutation)
  try {
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
    )
    registry.set(mutation, patch)
    const moved = registry.get(view)
    if (!AsyncResult.isSuccess(moved)) throw new Error("no optimistic value")
    const optimistic = moved.value.sections.todo.items.map(
      (row) => row.ticket.id
    )

    const before = items.find(([t]) => t.id === editedId)![0]
    finish(
      Response.json(
        encodeUpdateResponse(response(applyTicketPatch(before, patch)))
      )
    )
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    const after = registry.get(view)
    if (!AsyncResult.isSuccess(after)) throw new Error("no settled value")
    return {
      optimistic,
      settled: after.value.sections.todo.items.map((row) => row.ticket.id),
      patchUrl: patchUrl!
    }
  } finally {
    registry.dispose()
  }
}

describe("backlog edits to the sorted field move the row", () => {
  it("regroups the row by priority under `priority desc`", async () => {
    const items = [
      withTicket("T-1", { title: "Alpha", priority: "high" }),
      withTicket("T-3", { title: "Gamma", priority: "med" }),
      withTicket("T-2", { title: "Beta", priority: "med" }),
      withTicket("T-4", { title: "Delta", priority: "low" })
    ]
    const outcome = await orderAfterFieldEdit(
      { sort: { key: "priority", dir: "desc" } },
      items.map(priorityRow),
      items[3].id,
      { priority: "high" },
      (edited) => asUpdateResult(edited, priorityKey(edited))
    )
    expect(outcome.optimistic).toEqual(["T-4", "T-1", "T-3", "T-2"])
    expect(outcome.settled).toEqual(["T-4", "T-1", "T-3", "T-2"])
    expect(outcome.patchUrl.searchParams.get("sort")).toBe(
      '{"key":"priority","dir":"desc"}'
    )
  })

  it("re-alphabetizes the row under `title asc`", async () => {
    const items = [
      withTicket("T-1", { title: "Alpha" }),
      withTicket("T-2", { title: "Beta" }),
      withTicket("T-3", { title: "Gamma" })
    ]
    const outcome = await orderAfterFieldEdit(
      { sort: { key: "title", dir: "asc" } },
      items.map(titleRow),
      items[0].id,
      { title: "Zulu" },
      (edited) => asUpdateResult(edited, titleKey(edited))
    )
    expect(outcome.optimistic).toEqual(["T-2", "T-3", "T-1"])
    expect(outcome.settled).toEqual(["T-2", "T-3", "T-1"])
  })

  it("leaves the row alone when the edit misses the sorted field", async () => {
    const items = [
      withTicket("T-1", { title: "Alpha", priority: "low" }),
      withTicket("T-2", { title: "Beta", priority: "low" }),
      withTicket("T-3", { title: "Gamma", priority: "low" })
    ]
    const outcome = await orderAfterFieldEdit(
      { sort: { key: "title", dir: "asc" } },
      items.map(titleRow),
      items[1].id,
      { priority: "high" },
      (edited) => asUpdateResult(edited, titleKey(edited))
    )
    expect(outcome.optimistic).toEqual(["T-1", "T-2", "T-3"])
    expect(outcome.settled).toEqual(["T-1", "T-2", "T-3"])
  })

  it("defers to the order key the response carries when it disagrees", async () => {
    const items = [
      withTicket("T-1", { title: "Alpha", priority: "high" }),
      withTicket("T-2", { title: "Beta", priority: "med" }),
      withTicket("T-3", { title: "Gamma", priority: "low" })
    ]
    const outcome = await orderAfterFieldEdit(
      { sort: { key: "priority", dir: "desc" } },
      items.map(priorityRow),
      items[2].id,
      { priority: "high" },
      (edited) => asUpdateResult(edited, orderKey("01", edited.id))
    )
    expect(outcome.optimistic).toEqual(["T-3", "T-1", "T-2"])
    expect(outcome.settled).toEqual(["T-1", "T-2", "T-3"])
  })

  it("keeps supplementary characters in server order during a local title edit", async () => {
    const fullwidth = withTicket("T-2", { title: "ｚ" })
    const emoji = withTicket("T-1", { title: "😀" })
    const outcome = await orderAfterFieldEdit(
      { sort: { key: "title", dir: "asc" } },
      [fullwidth, emoji].map(titleRow),
      emoji.id,
      { title: "😀" },
      (edited) => asUpdateResult(edited, titleKey(edited))
    )
    expect(outcome.optimistic).toEqual(["T-2", "T-1"])
    expect(outcome.settled).toEqual(["T-2", "T-1"])
  })
})
