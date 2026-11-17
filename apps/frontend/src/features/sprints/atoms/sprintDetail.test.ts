import { Group, GroupDetail, GroupId, NotFound } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { localSprintDetail } from "@/features/local/atoms/localSprint"
import { localGroups } from "@/features/local/atoms/localViews"

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

const req = sprintRequest("acme", "web", groupId)

const fetchStub = stubFetch()

describe("sprintDetail", () => {
  it("shares one atom between structurally equal requests", () => {
    const a = sprintRequest("acme", "web", groupId)
    const b = sprintRequest("acme", "web", groupId)
    expect(sprintDetail(a)).toBe(sprintDetail(b))
  })

  const withCopy = (groups: ReadonlyArray<GroupDetail>) =>
    AtomRegistry.make({
      initialValues: [
        [localSprintDetail(req), AsyncResult.success(null)],
        [
          localGroups({ orgSlug: "acme", slug: "web" }),
          AsyncResult.success(groups)
        ]
      ]
    })

  it("is NotFound when the copy has no such sprint", () => {
    const registry = withCopy([])
    try {
      const error = AsyncResult.error(registry.get(sprintDetail(req)))
      expect(Option.getOrUndefined(error)).toBeInstanceOf(NotFound)
    } finally {
      registry.dispose()
    }
  })

  it("waits while the copy has the sprint but not its description", () => {
    const registry = withCopy([sprintDetailValue])
    try {
      expect(AsyncResult.isInitial(registry.get(sprintDetail(req)))).toBe(true)
    } finally {
      registry.dispose()
    }
  })
})

describe("updateSprintDetail", () => {
  it("paints a body edit instantly, before the request resolves", () => {
    fetchStub.set(() => new Promise<Response>(() => {}))
    const registry = AtomRegistry.make({
      initialValues: [
        [localSprintDetail(req), AsyncResult.success(sprintDetailValue)]
      ]
    })
    const view = sprintDetail(req)
    const mutation = updateSprintDetail(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      expect(registry.get(view)).toMatchObject({ value: { body: "Before" } })
      registry.set(mutation, { body: "After" })
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { body: "After" }
      })
    } finally {
      registry.dispose()
    }
  })
})
