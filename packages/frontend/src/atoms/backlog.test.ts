import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"
import {
  Ticket,
  TicketDetail,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { backlog, backlogRequest, updateBacklogTicket } from "./backlog"

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
