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
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { boardRequest, sprintBoard } from "./sprintBoard"
import {
  addTicketsToSprint,
  completeSprint,
  createSprint,
  deleteSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership,
  updateSprint
} from "./sprintList"

const groupId = Schema.decodeSync(GroupId)("G-1")
const otherGroupId = Schema.decodeSync(GroupId)("G-2")
const ticketA = Schema.decodeSync(TicketId)("T-1")
const ticketB = Schema.decodeSync(TicketId)("T-2")

const sprint: Group = {
  id: groupId,
  name: "Sprint 1",
  kind: "sprint",
  tickets: [ticketA],
  color: Schema.decodeSync(Group.fields.color)("#123456"),
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
}

const otherSprint: Group = {
  ...sprint,
  id: otherGroupId,
  name: "Sprint 2",
  tickets: []
}

const todo = Schema.decodeSync(TicketStatus)("todo")
const done = Schema.decodeSync(TicketStatus)("done")

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

const encodeGroup = Schema.encodeSync(Group)
const encodeGroupDetail = Schema.encodeSync(GroupDetail)
const encodeTicket = Schema.encodeSync(Ticket)
const asDetail = (g: Group): GroupDetail => ({ ...g, body: "" })

const req = sprintListRequest("acme", "web")

const listResponse = (groups: ReadonlyArray<Group>) =>
  Response.json(groups.map((group) => encodeGroup(group)))

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

describe("sprintList", () => {
  it("shares one atom between structurally equal requests", () => {
    const a = sprintListRequest("acme", "web")
    const b = sprintListRequest("acme", "web")
    expect(sprintList(a)).toBe(sprintList(b))
  })

  it("filters out non-sprint groups", async () => {
    fetchStub.set(() =>
      Promise.resolve(
        Response.json([
          encodeGroup(sprint),
          encodeGroup({ ...otherSprint, kind: "epic" })
        ])
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value).toHaveLength(1)
        expect(result.value[0].id).toBe(groupId)
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("updateSprint", () => {
  it("paints the rename instantly and holds until the refetch lands", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { name: "Renamed" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value[0].name).toBe("Renamed")

      finish(
        Response.json(
          encodeGroupDetail(asDetail({ ...sprint, name: "Renamed" }))
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("sends body in the payload without previewing it on the list row", async () => {
    let capturedBody: unknown
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Response(init.body).json().then((body) => {
          capturedBody = body
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        })
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { body: "New description" })
      await vi.waitFor(() =>
        expect(capturedBody).toMatchObject({
          body: "New description"
        })
      )
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value[0]).not.toHaveProperty("body")

      finish(Response.json(encodeGroupDetail(asDetail(sprint))))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("reverts the row when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { name: "Renamed" })
      finish(new Response("nope", { status: 500 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value[0].name).toBe("Sprint 1")
    } finally {
      registry.dispose()
    }
  })
})

describe("createSprint", () => {
  it("prepends a synthetic sprint optimistically", async () => {
    let served: ReadonlyArray<Group> = [sprint]
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse(served))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const create = createSprint(req)
    registry.mount(view)
    registry.mount(create)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(create, { name: "New sprint" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value[0].name).toBe("New sprint")
      expect(optimistic.value).toHaveLength(2)

      const createdSprint: Group = {
        ...sprint,
        id: otherGroupId,
        name: "New sprint"
      }
      served = [createdSprint, sprint]
      finish(Response.json(encodeGroup(createdSprint)))
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.map((s) => s.name).toSorted()).toEqual([
        "New sprint",
        "Sprint 1"
      ])
    } finally {
      registry.dispose()
    }
  })
})

describe("deleteSprint", () => {
  it("removes the sprint optimistically", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = deleteSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, undefined)
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value).toHaveLength(0)

      finish(new Response(null, { status: 204 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

describe("completeSprint", () => {
  it("marks the sprint complete and moves carryover tickets to the destination", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint, otherSprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = completeSprint({ req, groupId })
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
        destination: { kind: "sprint", groupId: otherGroupId }
      })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      const source = optimistic.value.find((s) => s.id === groupId)
      const dest = optimistic.value.find((s) => s.id === otherGroupId)
      expect(source?.completedAt).not.toBeNull()
      expect(source?.tickets).toHaveLength(0)
      expect(dest?.tickets).toContain(ticketA)

      finish(
        Response.json(
          encodeGroupDetail(
            asDetail({
              ...sprint,
              tickets: [],
              completedAt: DateTime.toDate(DateTime.nowUnsafe())
            })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

describe("completeSprint carryover", () => {
  it("splits carryover using ticket statuses read from the board wrapper, without a second fetch", async () => {
    const sprintWithBoth: Group = { ...sprint, tickets: [ticketA, ticketB] }
    const board = boardRequest("acme", "web", groupId)
    let finishComplete = (_r: Response) => {}
    fetchStub.set((input, init) =>
      routeByPath(
        input,
        [
          [
            (_url, method) => method === "POST",
            () =>
              new Promise<Response>((resolve) => {
                finishComplete = resolve
              })
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/tickets"),
            () =>
              Promise.resolve(
                Response.json([
                  encodeTicket(makeTicket(ticketA, done)),
                  encodeTicket(makeTicket(ticketB, todo))
                ])
              )
          ],
          [
            (url, method) =>
              method === "GET" && /\/groups\/[^/]+$/.test(url.pathname),
            () =>
              Promise.resolve(
                Response.json(encodeGroupDetail(asDetail(sprintWithBoth)))
              )
          ],
          [
            (url, method) =>
              method === "GET" && url.pathname.endsWith("/groups"),
            () => Promise.resolve(listResponse([sprintWithBoth, otherSprint]))
          ]
        ],
        init
      )
    )
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const boardView = sprintBoard(board)
    const mutation = completeSprint({ req, groupId })
    registry.mount(view)
    registry.mount(boardView)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      await vi.waitFor(() =>
        expect(registry.get(boardView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, {
        destination: { kind: "sprint", groupId: otherGroupId }
      })

      await vi.waitFor(() => {
        const optimistic = registry.get(view)
        if (!AsyncResult.isSuccess(optimistic)) {
          throw new Error("no optimistic value")
        }
        const source = optimistic.value.find((s) => s.id === groupId)
        const dest = optimistic.value.find((s) => s.id === otherGroupId)
        expect(source?.tickets).toEqual([ticketA])
        expect(dest?.tickets).toContain(ticketB)
        expect(dest?.tickets).not.toContain(ticketA)
      })

      finishComplete(
        Response.json(
          encodeGroupDetail(
            asDetail({
              ...sprintWithBoth,
              tickets: [ticketA],
              completedAt: DateTime.toDate(DateTime.nowUnsafe())
            })
          )
        )
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

describe("ticket membership mutations", () => {
  it("adds tickets to the target sprint and evicts them from other open sprints", async () => {
    const withTicketB: Group = { ...otherSprint, tickets: [ticketB] }
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint, withTicketB]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = addTicketsToSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { ticketIds: [ticketB] })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      const target = optimistic.value.find((s) => s.id === groupId)
      const evicted = optimistic.value.find((s) => s.id === otherGroupId)
      expect(target?.tickets).toEqual([ticketA, ticketB])
      expect(evicted?.tickets).toEqual([])

      finish(
        Response.json({
          target: encodeGroupDetail(
            asDetail({ ...sprint, tickets: [ticketA, ticketB] })
          ),
          evicted: [{ groupId: otherGroupId, ticketIds: [ticketB] }]
        })
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("removes tickets from the sprint", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = removeTicketsFromSprint({ req, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { ticketIds: [ticketA] })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value[0].tickets).toEqual([])

      finish(
        Response.json({
          target: encodeGroupDetail(asDetail({ ...sprint, tickets: [] })),
          evicted: []
        })
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})

describe("sprintMembership", () => {
  it("maps each ticket to its open sprint, ignoring completed sprints", async () => {
    const completedSprint: Group = {
      ...otherSprint,
      tickets: [ticketB],
      completedAt: DateTime.toDate(DateTime.nowUnsafe())
    }
    fetchStub.set(() =>
      Promise.resolve(listResponse([sprint, completedSprint]))
    )
    const registry = AtomRegistry.make()
    const view = sprintMembership(req)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value.get(ticketA)?.id).toBe(groupId)
        expect(result.value.has(ticketB)).toBe(false)
      })
    } finally {
      registry.dispose()
    }
  })
})
