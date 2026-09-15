import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import {
  Group,
  GroupDetail,
  GroupId,
  Ticket,
  TicketDetail,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import {
  boardRequest,
  placeBoardTicket,
  sprintBoard,
  updateBoardTicket
} from "./sprintBoard"

const groupId = Schema.decodeSync(GroupId)("G-1")
const ticketAId = Schema.decodeSync(TicketId)("T-1")
const ticketBId = Schema.decodeSync(TicketId)("T-2")
const todo = Schema.decodeSync(TicketStatus)("todo")
const inProgress = Schema.decodeSync(TicketStatus)("in_progress")

const makeTicket = (id: TicketId, status: TicketStatus): Ticket => ({
  id,
  title: `Ticket ${id}`,
  status,
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
})

const ticketA = makeTicket(ticketAId, todo)
const ticketB = makeTicket(ticketBId, todo)

const group: Group = {
  id: groupId,
  name: "Sprint 1",
  kind: "sprint",
  tickets: [ticketAId, ticketBId],
  color: Schema.decodeSync(Group.fields.color)("#123456"),
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
}

const encodeGroup = Schema.encodeSync(GroupDetail)
const encodeTicket = Schema.encodeSync(Ticket)
const encodeTicketDetail = Schema.encodeSync(TicketDetail)
const asGroupDetail = (g: Group): GroupDetail => ({ ...g, body: "" })
const asTicketDetail = (t: Ticket): TicketDetail => ({ ...t, body: "" })

const req = boardRequest("acme", "web", groupId)

const fetchStub = stubFetch()

const routeByPath = (
  input: RequestInfo | URL,
  matchers: ReadonlyArray<
    readonly [
      (url: URL, method: string | undefined) => boolean,
      () => Promise<Response>
    ]
  >,
  init?: RequestInit
): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET")
  for (const [match, handler] of matchers) {
    if (match(url, method)) return handler()
  }
  return Promise.reject(
    new Error(`unmatched request: ${method} ${url.pathname}`)
  )
}

describe("sprintBoard", () => {
  it("shares one atom between structurally equal requests", () => {
    const a = boardRequest("acme", "web", groupId)
    const b = boardRequest("acme", "web", groupId)
    expect(sprintBoard(a)).toBe(sprintBoard(b))
  })

  it("pairs each id from the group's order with its ticket", async () => {
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(
                Response.json([encodeTicket(ticketB), encodeTicket(ticketA)])
              )
          ],
          [
            (url, method) =>
              method === "GET" && !url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(Response.json(encodeGroup(asGroupDetail(group))))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintBoard(req)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value.tickets.map((t) => t.id)).toEqual([
          ticketAId,
          ticketBId
        ])
      })
    } finally {
      registry.dispose()
    }
  })

  it("reorders within a column instantly", async () => {
    let finishOrder = (_r: Response) => {}
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (_url, method) => method === "PATCH",
            () =>
              new Promise<Response>((resolve) => {
                finishOrder = resolve
              })
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(
                Response.json([encodeTicket(ticketA), encodeTicket(ticketB)])
              )
          ],
          [
            (url, method) =>
              method === "GET" && !url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(Response.json(encodeGroup(asGroupDetail(group))))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintBoard(req)
    const mutation = placeBoardTicket(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, {
        ticketId: ticketBId,
        after: null,
        status: undefined
      })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(optimistic.value.tickets.map((t) => t.id)).toEqual([
        ticketBId,
        ticketAId
      ])

      finishOrder(
        Response.json(
          encodeGroup(
            asGroupDetail({ ...group, tickets: [ticketBId, ticketAId] })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("holds the drag preview until both the group and its tickets refetch", async () => {
    let finishOrder = (_r: Response) => {}
    let finishTickets = (_r: Response) => {}
    let ticketsResolved = false
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (_url, method) => method === "PATCH",
            () =>
              new Promise<Response>((resolve) => {
                finishOrder = resolve
              })
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () => {
              if (!ticketsResolved) {
                // First (initial) load resolves immediately; subsequent refetch hangs
                // until the test releases it explicitly.
                ticketsResolved = true
                return Promise.resolve(
                  Response.json([encodeTicket(ticketA), encodeTicket(ticketB)])
                )
              }
              return new Promise<Response>((resolve) => {
                finishTickets = resolve
              })
            }
          ],
          [
            (url, method) =>
              method === "GET" && !url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(Response.json(encodeGroup(asGroupDetail(group))))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintBoard(req)
    const mutation = placeBoardTicket(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, {
        ticketId: ticketAId,
        status: inProgress,
        after: null
      })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      const moved = optimistic.value.tickets.find((t) => t.id === ticketAId)
      expect(moved?.status).toBe(inProgress)

      const reordered = { ...group, tickets: [ticketAId, ticketBId] }
      finishOrder(Response.json(encodeGroup(asGroupDetail(reordered))))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      // The mutation has settled but the tickets refetch has not: the view must
      // still be waiting and must not have reverted the optimistic status.
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: true
        })
      )
      const stillHeld = registry.get(view)
      if (!AsyncResult.isSuccess(stillHeld)) throw new Error("no held value")
      expect(
        stillHeld.value.tickets.find((t) => t.id === ticketAId)?.status
      ).toBe(inProgress)

      finishTickets(
        Response.json([
          encodeTicket({ ...ticketA, status: inProgress }),
          encodeTicket(ticketB)
        ])
      )
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(
        settled.value.tickets.find((t) => t.id === ticketAId)?.status
      ).toBe(inProgress)
    } finally {
      registry.dispose()
    }
  })

  it("reverts both order and status when the placement fails", async () => {
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (_url, method) => method === "PATCH",
            () => Promise.resolve(new Response("nope", { status: 500 }))
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(
                Response.json([encodeTicket(ticketA), encodeTicket(ticketB)])
              )
          ],
          [
            (url, method) =>
              method === "GET" && !url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(Response.json(encodeGroup(asGroupDetail(group))))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintBoard(req)
    const mutation = placeBoardTicket(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, {
        ticketId: ticketAId,
        status: inProgress,
        after: ticketBId
      })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(optimistic.value.tickets.map((t) => t.id)).toEqual([
        ticketBId,
        ticketAId
      ])

      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() => {
        const settled = registry.get(view)
        if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
        expect(settled.value.tickets.map((t) => t.id)).toEqual([
          ticketAId,
          ticketBId
        ])
        expect(
          settled.value.tickets.find((t) => t.id === ticketAId)?.status
        ).toBe(todo)
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("updateBoardTicket", () => {
  it("edits a card's fields from the board", async () => {
    let finishPatch = (_r: Response) => {}
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (_url, method) => method === "PATCH",
            () =>
              new Promise<Response>((resolve) => {
                finishPatch = resolve
              })
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(
                Response.json([encodeTicket(ticketA), encodeTicket(ticketB)])
              )
          ],
          [
            (url, method) =>
              method === "GET" && !url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(Response.json(encodeGroup(asGroupDetail(group))))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintBoard(req)
    const mutation = updateBoardTicket({ req, id: ticketAId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { title: "Renamed" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(
        optimistic.value.tickets.find((t) => t.id === ticketAId)?.title
      ).toBe("Renamed")

      finishPatch(
        Response.json(
          encodeTicketDetail(asTicketDetail({ ...ticketA, title: "Renamed" }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})
