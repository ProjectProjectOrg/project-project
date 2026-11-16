import { SidebarPin, StatusSlug, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { pinItem, pinsFor, pinsRequest, unpinItem } from "./pins"

const decodePin = Schema.decodeSync(SidebarPin)
const encodePins = Schema.encodeSync(Schema.Array(SidebarPin))
const encodePin = Schema.encodeSync(SidebarPin)
const fetchStub = stubFetch()
const req = pinsRequest("acme")

const ticketPin = (id: string, orderKey: string) =>
  decodePin({
    projectSlug: "web",
    kind: "ticket",
    ref: id,
    orderKey,
    ticket: { id, title: `Ticket ${id}`, status: "todo", archivedAt: null }
  })

const refs = (registry: AtomRegistry.AtomRegistry) => {
  const result = registry.get(pinsFor(req))
  if (!AsyncResult.isSuccess(result)) throw new Error("pins not loaded")
  return result.value.map((pin) => pin.ref)
}

const deferred = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const loaded = async (pins: ReadonlyArray<SidebarPin>) => {
  fetchStub.set(() => Promise.resolve(Response.json(encodePins(pins))))
  const registry = AtomRegistry.make()
  registry.mount(pinsFor(req))
  await vi.waitFor(() =>
    expect(registry.get(pinsFor(req))).toMatchObject({
      _tag: "Success",
      waiting: false
    })
  )
  return registry
}

describe("pinItem", () => {
  it("puts the pin on top of its project before the server answers and keeps it", async () => {
    const existing = ticketPin("WEB-1", "a0")
    const registry = await loaded([existing])
    const mutation = pinItem({ req, slug: "web" })
    registry.mount(mutation)
    try {
      const post = deferred()
      fetchStub.set(() => post.promise)
      const added = ticketPin("WEB-2", "Zz")
      const ref = Schema.decodeSync(TicketId)("WEB-2")
      registry.set(mutation, {
        payload: { kind: "ticket", ref },
        prediction: {
          ticket: {
            id: ref,
            title: "Ticket WEB-2",
            status: Schema.decodeSync(StatusSlug)("todo"),
            archivedAt: null
          }
        }
      })
      expect(refs(registry)).toEqual(["WEB-2", "WEB-1"])

      fetchStub.set(() =>
        Promise.resolve(Response.json(encodePins([added, existing])))
      )
      post.resolve(Response.json(encodePin(added)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(refs(registry)).toEqual(["WEB-2", "WEB-1"])
    } finally {
      registry.dispose()
    }
  })
})

describe("unpinItem", () => {
  it("drops the row at once and brings it back when the server refuses", async () => {
    const pin = ticketPin("WEB-1", "a0")
    const registry = await loaded([pin])
    const mutation = unpinItem({
      req,
      slug: "web",
      kind: "ticket",
      ref: "WEB-1"
    })
    registry.mount(mutation)
    try {
      const del = deferred()
      fetchStub.set(() => del.promise)
      registry.set(mutation, undefined)
      expect(refs(registry)).toEqual([])

      fetchStub.set(() => Promise.resolve(Response.json(encodePins([pin]))))
      del.resolve(Response.json({ _tag: "Forbidden" }, { status: 403 }))
      await vi.waitFor(() =>
        expect(AsyncResult.isFailure(registry.get(mutation))).toBe(true)
      )
      expect(refs(registry)).toEqual(["WEB-1"])
    } finally {
      registry.dispose()
    }
  })
})
