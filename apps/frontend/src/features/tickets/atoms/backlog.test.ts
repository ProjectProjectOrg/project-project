import type { TicketListQuery } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { backlog, backlogRequest, encodeTicketListQuery } from "./backlog"

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
