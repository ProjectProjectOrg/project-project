import { OrderKey, ProjectStatus, StatusSlug } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  dispatchStatusReorders,
  reorderStatus,
  statusesFor,
  statusesRequest
} from "./projectStatuses"

const decodeProjectStatusSync = Schema.decodeSync(ProjectStatus)

const decodeOrderKeySync = Schema.decodeSync(OrderKey)

const encodeProjectStatusSync = Schema.encodeSync(ProjectStatus)

const encode = Schema.encodeSync(Schema.Array(ProjectStatus))
const fetchStub = stubFetch()
const req = statusesRequest("acme", "web")
const todo = Schema.decodeSync(StatusSlug)("todo")
const done = Schema.decodeSync(StatusSlug)("done")

const makeStatus = (slug: StatusSlug, orderKey: string): ProjectStatus =>
  decodeProjectStatusSync({
    slug,
    label: slug,
    icon: "Circle",
    color: "#123456",
    orderKey,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })

describe("dispatchStatusReorders", () => {
  it("reorders immediately and settles the mutation", async () => {
    const todoStatus = makeStatus(todo, "a")
    const doneStatus = makeStatus(done, "b")
    const list = (statuses: ReadonlyArray<ProjectStatus>) =>
      Promise.resolve(Response.json(encode(statuses)))
    let served = [todoStatus, doneStatus]
    fetchStub.set(() => list(served))
    const registry = AtomRegistry.make()
    const view = statusesFor(req)
    const dispatch = dispatchStatusReorders(req)
    const mutation = reorderStatus({ req, statusSlug: todo })
    registry.mount(view)
    registry.mount(dispatch)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      let finishPatch!: (response: Response) => void
      const patch = new Promise<Response>((resolve) => {
        finishPatch = resolve
      })
      fetchStub.set(() => patch)

      registry.set(dispatch, [
        { statusSlug: todo, orderKey: decodeOrderKeySync("c") }
      ])
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value.map((status) => status.slug)).toEqual([
        done,
        todo
      ])
      expect(registry.get(mutation).waiting).toBe(true)

      served = [
        { ...todoStatus, orderKey: decodeOrderKeySync("c") },
        doneStatus
      ]
      fetchStub.set(() => list(served))
      finishPatch(Response.json(encodeProjectStatusSync(served[0])))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})
