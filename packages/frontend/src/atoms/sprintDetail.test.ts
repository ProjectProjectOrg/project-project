import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import { Group, GroupDetail, GroupId } from "@projectproject/shared"
import { Keys, projectScope } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"
import { updateSprint } from "./sprintList"
import { sprintDetail, sprintRequest, updateSprintDetail } from "./sprintDetail"

const groupId = Schema.decodeSync(GroupId)("G-1")

const sprintDetailValue: GroupDetail = {
  id: groupId,
  name: "Sprint 1",
  kind: "sprint",
  tickets: [],
  color: Schema.decodeSync(Group.fields.color)("#123456"),
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "Before"
}

const encode = Schema.encodeSync(GroupDetail)
const req = sprintRequest("acme", "web", groupId)

const fetchStub = stubFetch()

describe("sprintDetail", () => {
  it("reads groups.get and includes body", async () => {
    fetchStub.set(() =>
      Promise.resolve(Response.json(encode(sprintDetailValue)))
    )
    const registry = AtomRegistry.make()
    const view = sprintDetail(req)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value.body).toBe("Before")
      })
    } finally {
      registry.dispose()
    }
  })

  it("shares one atom between structurally equal requests", () => {
    const a = sprintRequest("acme", "web", groupId)
    const b = sprintRequest("acme", "web", groupId)
    expect(sprintDetail(a)).toBe(sprintDetail(b))
  })

  it("refetches once updateSprint publishes this sprint's key", async () => {
    let served = sprintDetailValue
    let finishPatch = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finishPatch = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const registry = AtomRegistry.make()
    const view = sprintDetail(req)
    const listReq = { params: { orgSlug: "acme", slug: "web" } }
    const mutation = updateSprint({ req: listReq, groupId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false,
          value: { body: "Before" }
        })
      )

      registry.set(mutation, { body: "After" })
      served = { ...sprintDetailValue, body: "After" }
      finishPatch(
        Response.json(encode({ ...sprintDetailValue, body: "After" }))
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          waiting: false,
          value: { body: "After" }
        })
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("updateSprintDetail", () => {
  it("paints a body edit instantly, before the request resolves", async () => {
    let served = sprintDetailValue
    let finish = (_r: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const registry = AtomRegistry.make()
    const view = sprintDetail(req)
    const mutation = updateSprintDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false,
          value: { body: "Before" }
        })
      )

      registry.set(mutation, { body: "After" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.body).toBe("After")

      served = { ...sprintDetailValue, body: "After" }
      finish(Response.json(encode(served)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          waiting: false,
          value: { body: "After" }
        })
      )
    } finally {
      registry.dispose()
    }
  })
})

describe("Keys.sprint", () => {
  it("scopes by project and sprint id", () => {
    expect(Keys.sprint(projectScope("acme", "web"), groupId)).toBe(
      `sprint/acme/web/${groupId}`
    )
  })
})
