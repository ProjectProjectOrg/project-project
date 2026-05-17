import { describe, expect, it } from "vitest"
import {
  ticketListQueryFromSearch,
  ticketListQueryToSearch
} from "./url"

describe("ticketListQueryFromSearch", () => {
  it("decodes a flat search record into the composite query", () => {
    const result = ticketListQueryFromSearch({
      status: ["todo", "in_progress"],
      type: "feat",
      assignee: ["mine", "unassigned"],
      tags: ["core"],
      q: "hello",
      sort: "created:desc"
    })
    expect(result.filter).toEqual({
      status: ["todo", "in_progress"],
      type: ["feat"],
      assignee: ["mine", null],
      tags: ["core"]
    })
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.q).toBe("hello")
  })

  it("applies the schema default sort when missing", () => {
    const result = ticketListQueryFromSearch({})
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.filter).toBeUndefined()
    expect(result.q).toBeUndefined()
  })

  it("ignores unknown keys and malformed values", () => {
    const result = ticketListQueryFromSearch({
      status: "garbage_status",
      sort: "no-colon",
      unrelated: "ignored"
    })
    expect(result.filter).toBeUndefined()
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
  })
})

describe("ticketListQueryToSearch", () => {
  it("encodes a query into a flat search record", () => {
    const search = ticketListQueryToSearch({
      filter: {
        status: ["todo"],
        assignee: ["mine", null]
      },
      sort: { key: "updated", dir: "desc" },
      q: "abc"
    })
    expect(search).toEqual({
      status: "todo",
      assignee: ["mine", "unassigned"],
      sort: "updated:desc",
      q: "abc"
    })
  })

  it("omits the default sort", () => {
    const search = ticketListQueryToSearch({
      sort: { key: "created", dir: "desc" }
    })
    expect(search).toEqual({})
  })

  it("collapses single-element arrays to scalars", () => {
    const search = ticketListQueryToSearch({
      filter: { tags: ["core"] }
    })
    expect(search).toEqual({ tags: "core" })
  })

  it("round-trips for non-trivial queries", () => {
    const original = {
      filter: {
        status: ["todo", "in_progress"] as const,
        assignee: ["mine", null, "user_abc"] as const
      },
      sort: { key: "title" as const, dir: "asc" as const },
      q: "search term"
    }
    const search = ticketListQueryToSearch(original)
    const decoded = ticketListQueryFromSearch(search)
    expect(decoded.filter?.status).toEqual(original.filter.status)
    expect(decoded.filter?.assignee).toEqual(original.filter.assignee)
    expect(decoded.sort).toEqual(original.sort)
    expect(decoded.q).toBe(original.q)
  })
})
