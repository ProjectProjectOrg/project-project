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
  TicketStatus,
  UpdateGroupTicketsInput
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { backlog, backlogRequest } from "./backlog"
import { boardRequest, sprintBoard } from "./sprintBoard"
import {
  addTicketsToSprint,
  assignTicketToSprint,
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

const makeTicket = (id: TicketId): Ticket => ({
  id,
  title: `Ticket ${id}`,
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
})

const encodeGroup = Schema.encodeSync(Group)
const encodeGroupDetail = Schema.encodeSync(GroupDetail)
const encodeTicket = Schema.encodeSync(Ticket)
const asDetail = (g: Group): GroupDetail => ({ ...g, body: "" })

const req = sprintListRequest("acme", "web")

const listResponse = (groups: ReadonlyArray<Group>) =>
  Response.json(groups.map((group) => encodeGroup(group)))

const completeResponse = (target: Group, carried: ReadonlyArray<TicketId>) =>
  Response.json({
    target: encodeGroupDetail(asDetail(target)),
    carried
  })

const fetchStub = stubFetch()

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
      expect(optimistic.value[0].id).not.toBe(otherGroupId)
      expect(optimistic.value).toHaveLength(2)

      const createdSprint: Group = {
        ...sprint,
        id: otherGroupId,
        name: "New sprint"
      }
      served = [createdSprint, sprint]
      finish(Response.json(encodeGroup(createdSprint)))
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))

      const confirmed = registry.get(view)
      if (!AsyncResult.isSuccess(confirmed)) {
        throw new Error("did not confirm")
      }
      expect(confirmed.value[0].id).toBe(otherGroupId)
      expect(confirmed.value[0].name).toBe("New sprint")

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
  it("paints completedAt instantly, without predicting which tickets move", async () => {
    let served: ReadonlyArray<Group> = [sprint, otherSprint]
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
      expect(source?.tickets).toEqual([ticketA])
      expect(dest?.tickets).toEqual([])

      const completedSprint: Group = {
        ...sprint,
        tickets: [],
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
      served = [completedSprint, { ...otherSprint, tickets: [ticketA] }]
      finish(completeResponse(completedSprint, [ticketA]))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      const settledSource = settled.value.find((s) => s.id === groupId)
      const settledDest = settled.value.find((s) => s.id === otherGroupId)
      expect(settledSource?.tickets).toEqual([])
      expect(settledDest?.tickets).toContain(ticketA)
    } finally {
      registry.dispose()
    }
  })
})

describe("completeSprint carryover", () => {
  it("applies the exact server-computed stay/carry partition to source and destination", async () => {
    const sprintWithBoth: Group = { ...sprint, tickets: [ticketA, ticketB] }
    let served: ReadonlyArray<Group> = [sprintWithBoth, otherSprint]
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

      const completedSprint: Group = {
        ...sprintWithBoth,
        tickets: [ticketA],
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
      served = [completedSprint, { ...otherSprint, tickets: [ticketB] }]
      finish(completeResponse(completedSprint, [ticketB]))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      const source = settled.value.find((s) => s.id === groupId)
      const dest = settled.value.find((s) => s.id === otherGroupId)
      expect(source?.tickets).toEqual([ticketA])
      expect(source?.completedAt).not.toBeNull()
      expect(dest?.tickets).toContain(ticketB)
      expect(dest?.tickets).not.toContain(ticketA)
    } finally {
      registry.dispose()
    }
  })

  it("publishes the destination's own key so a mounted destination board picks up the carried ticket", async () => {
    const sprintWithBoth: Group = { ...sprint, tickets: [ticketA, ticketB] }
    let servedList: ReadonlyArray<Group> = [sprintWithBoth, otherSprint]
    let servedDest: Group = otherSprint
    let servedDestTickets: ReadonlyArray<Ticket> = []
    let finish = (_r: Response) => {}
    fetchStub.set((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET")
      if (method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      if (url.pathname.endsWith(`/${otherGroupId}/tickets`)) {
        return Promise.resolve(
          Response.json(servedDestTickets.map((t) => encodeTicket(t)))
        )
      }
      if (url.pathname.endsWith(`/${otherGroupId}`)) {
        return Promise.resolve(
          Response.json(encodeGroupDetail(asDetail(servedDest)))
        )
      }
      return Promise.resolve(listResponse(servedList))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const destBoard = sprintBoard(boardRequest("acme", "web", otherGroupId))
    const mutation = completeSprint({ req, groupId })
    registry.mount(view)
    registry.mount(destBoard)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      await vi.waitFor(() =>
        expect(registry.get(destBoard)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      const before = registry.get(destBoard)
      if (!AsyncResult.isSuccess(before)) throw new Error("not ready")
      expect(before.value.tickets.map((t) => t.id)).not.toContain(ticketB)

      registry.set(mutation, {
        destination: { kind: "sprint", groupId: otherGroupId }
      })

      const completedSprint: Group = {
        ...sprintWithBoth,
        tickets: [ticketA],
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
      servedList = [completedSprint, { ...otherSprint, tickets: [ticketB] }]
      servedDest = { ...otherSprint, tickets: [ticketB] }
      servedDestTickets = [makeTicket(ticketB)]
      finish(completeResponse(completedSprint, [ticketB]))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      await vi.waitFor(() => {
        const after = registry.get(destBoard)
        if (!AsyncResult.isSuccess(after)) throw new Error("did not settle")
        expect(after.value.tickets.map((t) => t.id)).toContain(ticketB)
      })
    } finally {
      registry.dispose()
    }
  })

  it("drops carried tickets off every sprint when the destination is the backlog", async () => {
    const sprintWithBoth: Group = { ...sprint, tickets: [ticketA, ticketB] }
    let served: ReadonlyArray<Group> = [sprintWithBoth, otherSprint]
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

      registry.set(mutation, { destination: { kind: "backlog" } })

      const completedSprint: Group = {
        ...sprintWithBoth,
        tickets: [ticketA],
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
      served = [completedSprint, otherSprint]
      finish(completeResponse(completedSprint, [ticketB]))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      const source = settled.value.find((s) => s.id === groupId)
      const other = settled.value.find((s) => s.id === otherGroupId)
      expect(source?.tickets).toEqual([ticketA])
      expect(other?.tickets).toEqual([])
    } finally {
      registry.dispose()
    }
  })

  it("resolves the correct final state even though the sprint's board is never mounted", async () => {
    const sprintWithBoth: Group = { ...sprint, tickets: [ticketA, ticketB] }
    let served: ReadonlyArray<Group> = [sprintWithBoth, otherSprint]
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

      const completedSprint: Group = {
        ...sprintWithBoth,
        tickets: [ticketA],
        completedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
      served = [completedSprint, { ...otherSprint, tickets: [ticketB] }]
      finish(completeResponse(completedSprint, [ticketB]))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      const source = settled.value.find((s) => s.id === groupId)
      const dest = settled.value.find((s) => s.id === otherGroupId)
      expect(source?.tickets).toEqual([ticketA])
      expect(dest?.tickets).toContain(ticketB)
      expect(dest?.tickets).not.toContain(ticketA)
    } finally {
      registry.dispose()
    }
  })
})

describe("ticket membership mutations", () => {
  it("refreshes source and destination boards and filtered backlogs after assignment and removal", async () => {
    let groups: ReadonlyArray<Group> = [sprint, otherSprint]
    fetchStub.set(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      const selected = groups.find((group) =>
        url.pathname.includes(`/groups/${group.id}`)
      )
      if (request.method === "PATCH" && selected) {
        const payload = Schema.decodeUnknownSync(UpdateGroupTicketsInput)(
          await request.json()
        )
        const target = { ...selected, tickets: payload.tickets }
        const evicted = groups.flatMap((group) => {
          if (group.id === target.id) return []
          const ticketIds = group.tickets.filter((id) =>
            payload.tickets.includes(id)
          )
          return ticketIds.length > 0 ? [{ groupId: group.id, ticketIds }] : []
        })
        groups = groups.map((group) =>
          group.id === target.id
            ? target
            : {
                ...group,
                tickets: group.tickets.filter(
                  (id) => !payload.tickets.includes(id)
                )
              }
        )
        return Response.json({
          target: encodeGroupDetail(asDetail(target)),
          evicted
        })
      }
      if (url.pathname.endsWith("/sections")) {
        const target = groups.find((group) => group.id === otherGroupId)!
        return Response.json({
          counts: {
            total: target.tickets.length,
            byStatus: { todo: target.tickets.length }
          },
          sections: {
            todo: {
              items: target.tickets.map((id) => ({
                ticket: encodeTicket(makeTicket(id)),
                orderKey: id
              })),
              nextCursor: null
            }
          }
        })
      }
      if (selected) {
        return url.pathname.endsWith("/tickets")
          ? Response.json(
              selected.tickets.map((id) => encodeTicket(makeTicket(id)))
            )
          : Response.json(encodeGroupDetail(asDetail(selected)))
      }
      return listResponse(groups)
    })
    const registry = AtomRegistry.make()
    const source = sprintBoard(boardRequest("acme", "web", groupId))
    const destination = sprintBoard(boardRequest("acme", "web", otherGroupId))
    const filtered = backlog(
      backlogRequest("acme", "web", {
        groupId: [otherGroupId],
        sort: { key: "id", dir: "asc" }
      })
    )
    const add = addTicketsToSprint({ req, ticketId: ticketA })
    const remove = removeTicketsFromSprint({ req, ticketId: ticketA })
    registry.mount(sprintList(req))
    registry.mount(source)
    registry.mount(destination)
    registry.mount(filtered)
    registry.mount(add)
    registry.mount(remove)
    try {
      await vi.waitFor(() => {
        expect(registry.get(source)).toMatchObject({
          waiting: false,
          value: { tickets: [{ id: ticketA }] }
        })
        expect(registry.get(destination)).toMatchObject({
          waiting: false,
          value: { tickets: [] }
        })
        expect(registry.get(filtered)).toMatchObject({
          waiting: false,
          value: { counts: { total: 0 } }
        })
      })
      registry.set(add, { groupId: otherGroupId })
      await vi.waitFor(() => {
        expect(registry.get(add)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(source)).toMatchObject({
          waiting: false,
          value: { tickets: [] }
        })
        expect(registry.get(destination)).toMatchObject({
          waiting: false,
          value: { tickets: [{ id: ticketA }] }
        })
        expect(registry.get(filtered)).toMatchObject({
          waiting: false,
          value: { counts: { total: 1 } }
        })
      })
      registry.set(remove, { groupId: otherGroupId })
      await vi.waitFor(() => {
        expect(registry.get(remove)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
        expect(registry.get(destination)).toMatchObject({
          waiting: false,
          value: { tickets: [] }
        })
        expect(registry.get(filtered)).toMatchObject({
          waiting: false,
          value: { counts: { total: 0 } }
        })
      })
    } finally {
      registry.dispose()
    }
  })

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
    const mutation = addTicketsToSprint({ req, ticketId: ticketB })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { groupId })
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
    const mutation = removeTicketsFromSprint({ req, ticketId: ticketA })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { groupId })
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

  it("is keyed by request and ticket, so two tickets get independent mutation atoms", () => {
    expect(addTicketsToSprint({ req, ticketId: ticketA })).toBe(
      addTicketsToSprint({ req, ticketId: ticketA })
    )
    expect(addTicketsToSprint({ req, ticketId: ticketA })).not.toBe(
      addTicketsToSprint({ req, ticketId: ticketB })
    )
    expect(removeTicketsFromSprint({ req, ticketId: ticketA })).not.toBe(
      removeTicketsFromSprint({ req, ticketId: ticketB })
    )
  })

  it("rolls back and surfaces a failure when the assignment request fails", async () => {
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(listResponse([sprint, otherSprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = addTicketsToSprint({ req, ticketId: ticketA })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { groupId: otherGroupId })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(
        optimistic.value.find((s) => s.id === otherGroupId)?.tickets
      ).toEqual([ticketA])

      finish(new Response("nope", { status: 500 }))

      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(AsyncResult.isFailure(registry.get(mutation))).toBe(true)
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.find((s) => s.id === otherGroupId)?.tickets).toEqual(
        []
      )
    } finally {
      registry.dispose()
    }
  })

  it("does not mark a second ticket's mutation atom as failed when the first ticket's assignment fails", async () => {
    let finishFirst = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finishFirst = resolve
        })
      }
      return Promise.resolve(listResponse([sprint, otherSprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutationA = addTicketsToSprint({ req, ticketId: ticketA })
    const mutationB = addTicketsToSprint({ req, ticketId: ticketB })
    registry.mount(view)
    registry.mount(mutationA)
    registry.mount(mutationB)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutationA, { groupId: otherGroupId })
      finishFirst(new Response("nope", { status: 500 }))
      await vi.waitFor(() =>
        expect(registry.get(mutationA).waiting).toBe(false)
      )

      expect(AsyncResult.isFailure(registry.get(mutationA))).toBe(true)
      expect(AsyncResult.isFailure(registry.get(mutationB))).toBe(false)
    } finally {
      registry.dispose()
    }
  })
})

describe("assignTicketToSprint", () => {
  it("mounts the per-ticket mutation atom, dispatches, and unmounts once it settles", async () => {
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(
          Response.json({
            target: encodeGroupDetail(
              asDetail({ ...sprint, tickets: [ticketA, ticketB] })
            ),
            evicted: []
          })
        )
      }
      return Promise.resolve(listResponse([sprint]))
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      assignTicketToSprint(registry, req, ticketB, groupId)

      await vi.waitFor(() => {
        const settled = registry.get(view)
        if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
        expect(settled.value[0].tickets).toContain(ticketB)
      })
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
