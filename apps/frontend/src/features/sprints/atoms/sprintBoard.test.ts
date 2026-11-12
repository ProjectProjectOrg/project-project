import {
  TicketRank,
  EMPTY_TICKET_RELATIONS,
  Group,
  GroupDetail,
  GroupId,
  Ticket,
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketUpdateResult,
  UpdateTicketInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { boardRequest, sprintBoard, updateBoardTicket } from "./sprintBoard"

const encodeTicketUpdateResultSync = Schema.encodeSync(TicketUpdateResult)

const decodeUnknownUpdateTicketInputSync =
  Schema.decodeUnknownSync(UpdateTicketInput)

const groupId = Schema.decodeSync(GroupId)("G-1")
const ticketAId = Schema.decodeSync(TicketId)("T-1")
const ticketBId = Schema.decodeSync(TicketId)("T-2")
const todo = Schema.decodeSync(TicketStatus)("todo")
const inProgress = Schema.decodeSync(TicketStatus)("in_progress")

const makeTicket = (
  id: TicketId,
  status: TicketStatus,
  rank: string
): Ticket => ({
  id,
  title: `Ticket ${id}`,
  status,
  type: "chore",
  priority: "med",
  estimate: null,
  flag: null,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  rank: TicketRank.make(rank),
  lastTransitionedPr: null,
  parent: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
})

const ticketA = makeTicket(ticketAId, todo, "a0")
const ticketB = makeTicket(ticketBId, todo, "a1")

const group: Group = {
  id: groupId,
  name: "Sprint 1",
  kind: "sprint",
  tickets: [ticketBId, ticketAId],
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
const encodeTicketUpdate = (ticket: TicketDetail) =>
  encodeTicketUpdateResultSync({ ticket, orderKey: null })
const asGroupDetail = (g: Group): GroupDetail => ({ ...g, body: "" })
const asTicketDetail = (t: Ticket): TicketDetail => ({
  ...t,
  relations: EMPTY_TICKET_RELATIONS,
  creator: null,
  updater: null,
  body: ""
})

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

  it("orders cards by rank, whatever order the sprint lists them in", async () => {
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
    const mutation = updateBoardTicket({ req, id: ticketBId })
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
        position: { to: { before: ticketAId }, rank: TicketRank.make("Zz") }
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
          encodeTicketUpdate(
            asTicketDetail({ ...ticketB, rank: TicketRank.make("Zy") })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
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
      registry.set(mutation, {
        status: inProgress,
        position: { to: { after: ticketBId }, rank: TicketRank.make("a2") }
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
          encodeTicketUpdate(asTicketDetail({ ...ticketA, title: "Renamed" }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("saves rapid card edits in order", async () => {
    const payloads: Array<unknown> = []
    let finishFirst: ((response: Response) => void) | undefined
    let served = ticketA
    const confirmed = { ...ticketA, title: "Renamed", type: "bug" as const }
    fetchStub.set(async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      if (request.method === "PATCH") {
        const payload = decodeUnknownUpdateTicketInputSync(await request.json())
        payloads.push(payload)
        if (payload.type !== undefined) {
          served = confirmed
          return Response.json(encodeTicketUpdate(asTicketDetail(confirmed)))
        }
        return new Promise<Response>((resolve) => {
          finishFirst = resolve
        })
      }
      if (request.url.endsWith("/tickets")) {
        return Response.json([encodeTicket(served), encodeTicket(ticketB)])
      }
      return Response.json(encodeGroup(asGroupDetail(group)))
    })
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
      registry.set(mutation, { type: "bug" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) throw new Error("not ready")
      expect(optimistic.value.tickets[0]).toMatchObject({
        title: "Renamed",
        type: "bug"
      })
      await vi.waitFor(() => expect(payloads).toHaveLength(1))
      served = { ...ticketA, title: "Renamed" }
      finishFirst?.(Response.json(encodeTicketUpdate(asTicketDetail(served))))
      await vi.waitFor(() =>
        expect(payloads).toEqual([{ title: "Renamed" }, { type: "bug" }])
      )
      await vi.waitFor(() => {
        expect(registry.get(mutation)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(view)).toMatchObject({
          waiting: false,
          value: { tickets: [confirmed, ticketB] }
        })
      })
    } finally {
      registry.dispose()
    }
  })
})
