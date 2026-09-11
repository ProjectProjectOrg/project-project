import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Group, GroupColor, GroupId } from "@projectproject/shared"
import { sprintList, sprintListRequest, updateSprint } from "./sprintList"

const makeGroupId = Schema.decodeUnknownSync(GroupId)
const makeGroupColor = Schema.decodeUnknownSync(GroupColor)

const sprint = {
  id: makeGroupId("G-1"),
  name: "Sprint 1",
  kind: "sprint" as const,
  tickets: [],
  color: makeGroupColor("#777777"),
  startsAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  endsAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-15T00:00:00.000Z")),
  completedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Group

const encode = Schema.encodeSync(Group)
const req = sprintListRequest("acme", "web")

afterEach(() => vi.unstubAllGlobals())

describe("sprint list optimistic update", () => {
  it("paints a rename instantly and holds until the refetch lands", async () => {
    let served = [sprint]
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json([encode(sprint)]))
      })
    )
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId: sprint.id })
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
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: [{ name: "Renamed" }]
      })
      finish(Response.json(encode({ ...sprint, name: "Renamed" })))
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
    } finally {
      registry.dispose()
    }
  })

  it("applies a description edit optimistically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return Promise.resolve(Response.json(encode(sprint)))
        }
        return Promise.resolve(Response.json([encode(sprint)]))
      })
    )
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId: sprint.id })
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
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic))
        throw new Error("no optimistic value")
      expect(optimistic.value[0].body).toBe("New description")
    } finally {
      registry.dispose()
    }
  })

  it("reverts a failed rename", async () => {
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json([encode(sprint)]))
      })
    )
    const registry = AtomRegistry.make()
    const view = sprintList(req)
    const mutation = updateSprint({ req, groupId: sprint.id })
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
      expect(registry.get(view)).toMatchObject({
        value: [{ name: "Sprint 1" }]
      })
    } finally {
      registry.dispose()
    }
  })
})
