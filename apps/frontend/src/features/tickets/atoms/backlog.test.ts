import { type TicketListQuery, TypeKey } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { localBacklog } from "@/features/local/atoms/localBacklog"

import { backlog, backlogRequest, encodeTicketListQuery } from "./backlog"
import { quickCreateBacklogTicketOnServer } from "./backlogCreate"

const fetchStub = stubFetch()

describe("backlog", () => {
  it("shares one atom between structurally equal requests", () => {
    const a = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" }
    })
    const b = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" }
    })
    expect(backlog(a)).toBe(backlog(b))
  })

  it("shares one atom when the search includes a view field", () => {
    const a = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" }
    })
    const b = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" },
      view: "board"
    })
    expect(backlog(a)).toBe(backlog(b))
    expect(a.query).not.toHaveProperty("view")
    expect(b.query).not.toHaveProperty("view")
  })

  it("shows the composer's new ticket on the local list while the server creates it", () => {
    fetchStub.set(() => new Promise<Response>(() => {}))
    const req = backlogRequest("acme", "web", {
      sort: { key: "id", dir: "asc" }
    })
    const registry = AtomRegistry.make({
      initialValues: [
        [
          localBacklog(req),
          AsyncResult.success({
            counts: { total: 0, byStatus: {} },
            sections: {}
          })
        ]
      ]
    })
    const view = backlog(req)
    const create = quickCreateBacklogTicketOnServer(req)
    registry.mount(view)
    registry.mount(create)
    try {
      registry.set(create, {
        payload: { title: "Login loops", type: TypeKey.make("bug") },
        prediction: {
          clientId: "creation-1",
          createdBy: "user-1",
          projectPrefix: "T",
          estimation: "off"
        }
      })
      expect(registry.get(view)).toMatchObject({
        value: {
          counts: { total: 1 },
          sections: {
            todo: {
              items: [
                {
                  key: "creation-1",
                  pending: true,
                  ticket: { title: "Login loops" }
                }
              ]
            }
          }
        }
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("encodeTicketListQuery", () => {
  it("canonicalizes structurally equal queries regardless of key order", () => {
    const a: TicketListQuery = {
      archived: false,
      sort: { key: "updated", dir: "desc" },
      q: "foo"
    }
    const b: TicketListQuery = {
      q: "foo",
      sort: { dir: "desc", key: "updated" },
      archived: false
    }
    expect(encodeTicketListQuery(a)).toBe(encodeTicketListQuery(b))
  })

  it("still distinguishes queries that actually differ", () => {
    const a: TicketListQuery = { sort: { key: "updated", dir: "desc" } }
    const b: TicketListQuery = { sort: { key: "created", dir: "desc" } }
    expect(encodeTicketListQuery(a)).not.toBe(encodeTicketListQuery(b))
  })
})
