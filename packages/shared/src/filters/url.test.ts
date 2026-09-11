import { describe, expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import { StatusSlug } from "../schemas/Status"
import { TagName } from "../schemas/Tag"
import { UserId } from "../schemas/User"
import { DEFAULT_TICKET_SORT, TicketListQuery } from "./Ticket"
import { ticketListQueryFromSearch, ticketListQueryToSearch } from "./url"

const s = Schema.decodeUnknownSync(StatusSlug)
const userId = Schema.decodeUnknownSync(UserId)
const tagName = Schema.decodeSync(TagName)

describe("ticketListQueryFromSearch", () => {
  it("applies the default sort when the key is absent or undefined", () => {
    expect(Schema.decodeUnknownSync(TicketListQuery)({}).sort).toEqual(
      DEFAULT_TICKET_SORT
    )
    expect(
      Schema.decodeUnknownSync(TicketListQuery)({ sort: undefined }).sort
    ).toEqual(DEFAULT_TICKET_SORT)
  })

  it("decodes a flat search record into the composite query", () => {
    const result = ticketListQueryFromSearch({
      status: ["todo", "in_progress"],
      type: ["feat"],
      assignee: ["mine", "unassigned"],
      tags: ["core"],
      q: "hello",
      sort: "created:desc"
    })
    expect(result.status).toEqual(["todo", "in_progress"])
    expect(result.type).toEqual(["feat"])
    expect(result.assignee).toEqual(["mine", "unassigned"])
    expect(result.tags).toEqual(["core"])
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.q).toBe("hello")
  })

  it("applies the schema default sort when missing", () => {
    const result = ticketListQueryFromSearch({})
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.status).toBeUndefined()
    expect(result.q).toBeUndefined()
  })

  it("ignores malformed sort and unknown keys, passes slug-shaped status", () => {
    const result = ticketListQueryFromSearch({
      status: "garbage_status",
      sort: "no-colon",
      unrelated: "ignored"
    } as never)
    expect(result.status).toEqual(["garbage_status"])
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
  })

  it("rejects status values that fail the slug pattern", () => {
    const result = ticketListQueryFromSearch({
      status: "INVALID STATUS!"
    } as never)
    expect(result.status).toBeUndefined()
  })
})

describe("ticketListQueryToSearch", () => {
  it("encodes a query into a flat search record", () => {
    const search = ticketListQueryToSearch({
      status: [s("todo")],
      assignee: ["mine", "unassigned"],
      sort: { key: "updated", dir: "desc" },
      q: "abc"
    })
    expect(search).toEqual({
      status: ["todo"],
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

  it("keeps single-element arrays as arrays", () => {
    const search = ticketListQueryToSearch({
      tags: [tagName("core")],
      sort: DEFAULT_TICKET_SORT
    })
    expect(search).toEqual({ tags: ["core"] })
  })

  it("round-trips for non-trivial queries", () => {
    const original = {
      status: [s("todo"), s("in_progress")] as const,
      assignee: ["mine", "unassigned", userId("user_abc")] as const,
      sort: { key: "title" as const, dir: "asc" as const },
      q: "search term"
    }
    const search = ticketListQueryToSearch(original)
    const decoded = ticketListQueryFromSearch(search)
    expect(decoded.status).toEqual(original.status)
    expect(decoded.assignee).toEqual(original.assignee)
    expect(decoded.sort).toEqual(original.sort)
    expect(decoded.q).toBe(original.q)
  })

  it("keeps the legacy unassigned group URL and decodes it as ungrouped", () => {
    const search = ticketListQueryToSearch({
      groupId: ["ungrouped"],
      sort: DEFAULT_TICKET_SORT
    })
    expect(search).toEqual({ groupId: ["unassigned"] })
    const decoded = ticketListQueryFromSearch(search)
    expect(decoded.groupId).toEqual(["ungrouped"])
  })

  it("mixes ungrouped and real GroupIds through encode/decode", () => {
    const search = ticketListQueryToSearch({
      groupId: ["ungrouped", "G-7" as never],
      sort: DEFAULT_TICKET_SORT
    })
    expect(search).toEqual({ groupId: ["unassigned", "G-7"] })
    const decoded = ticketListQueryFromSearch(search)
    expect(decoded.groupId).toEqual(["ungrouped", "G-7"])
  })
})
