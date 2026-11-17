import {
  BulkUpdateTicketsInput,
  Group,
  GroupDetail,
  GroupId,
  TicketId,
  UpdateGroupTicketsInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { fireMutation } from "@/api/viewMutation"

import {
  addTicketsToSprint,
  assignTicketToSprint,
  bulkAddTicketsToSprint,
  createSprint,
  deleteSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership
} from "./sprintList"

const decodeUnknownUpdateGroupTicketsInputSync = Schema.decodeUnknownSync(
  UpdateGroupTicketsInput
)

const decodeUnknownBulkUpdateTicketsInputSync = Schema.decodeUnknownSync(
  BulkUpdateTicketsInput
)

const decodeTicketId = Schema.decodeSync(TicketId)

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

const encodeGroup = Schema.encodeSync(Group)
const encodeGroupDetail = Schema.encodeSync(GroupDetail)
const asDetail = (g: Group): GroupDetail => ({ ...g, body: "" })

const req = sprintListRequest("acme", "web")

const listResponse = (groups: ReadonlyArray<Group>) =>
  Response.json(groups.map((group) => encodeGroup(group)))

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

  it("splits a large sprint assignment into accepted batches", async () => {
    const tickets = Array.from({ length: 250 }, (_, index) =>
      decodeTicketId(`T-${index + 10}`)
    )
    const sent: Array<number> = []
    fetchStub.set(async (input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith("/tickets/bulk")) {
        return listResponse([sprint])
      }
      sent.push(
        decodeUnknownBulkUpdateTicketsInputSync(await request.json()).tickets
          .length
      )
      return Response.json({
        tickets: [],
        sprint: { target: encodeGroupDetail(asDetail(sprint)), evicted: [] }
      })
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success" })
      )
      const result = await fireMutation(registry, bulkAddTicketsToSprint(req), {
        groupId,
        tickets
      })
      expect(AsyncResult.isSuccess(result)).toBe(true)
      expect(sent).toEqual([200, 50])
    } finally {
      registry.dispose()
    }
  })

  it("refetches the sprint list when a later batch fails", async () => {
    const tickets = Array.from({ length: 250 }, (_, index) =>
      decodeTicketId(`T-${index + 10}`)
    )
    let batches = 0
    let lists = 0
    fetchStub.set((input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith("/tickets/bulk")) {
        lists += 1
        return Promise.resolve(listResponse([sprint]))
      }
      batches += 1
      return Promise.resolve(
        batches === 1
          ? Response.json({
              tickets: [],
              sprint: {
                target: encodeGroupDetail(asDetail(sprint)),
                evicted: []
              }
            })
          : new Response(null, { status: 500 })
      )
    })
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success" })
      )
      const before = lists
      const result = await fireMutation(registry, bulkAddTicketsToSprint(req), {
        groupId,
        tickets
      })
      expect(AsyncResult.isFailure(result)).toBe(true)
      await vi.waitFor(() => expect(lists).toBeGreaterThan(before))
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

  it("sends additive membership patches and keeps stacked assigns when confirms race", async () => {
    const pending: Array<
      Readonly<{
        tickets: ReadonlyArray<TicketId>
        resolve: (response: Response) => void
      }>
    > = []
    fetchStub.set(async (input, init) => {
      if (init?.method === "PATCH") {
        const request = new Request(input, init)
        expect(new URL(request.url).pathname).toContain("/tickets/add")
        const payload = decodeUnknownUpdateGroupTicketsInputSync(
          await request.json()
        )
        return new Promise<Response>((resolve) => {
          pending.push({ tickets: payload.tickets, resolve })
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
      registry.set(mutationB, { groupId: otherGroupId })
      await vi.waitFor(() => expect(pending).toHaveLength(2))
      expect(pending.map(({ tickets }) => tickets)).toEqual(
        expect.arrayContaining([[ticketA], [ticketB]])
      )

      const stale = pending.find((entry) => entry.tickets[0] === ticketA)
      if (stale === undefined) throw new Error("missing T-1 request")
      stale.resolve(
        Response.json({
          target: encodeGroupDetail(
            asDetail({ ...otherSprint, tickets: [ticketA] })
          ),
          evicted: []
        })
      )
      await vi.waitFor(() =>
        expect(registry.get(mutationA).waiting).toBe(false)
      )

      const afterStale = registry.get(view)
      if (!AsyncResult.isSuccess(afterStale)) {
        throw new Error("did not keep the stacked assignment")
      }
      expect(
        afterStale.value.find((sprint) => sprint.id === otherGroupId)?.tickets
      ).toEqual(expect.arrayContaining([ticketA, ticketB]))
    } finally {
      registry.dispose()
    }
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
