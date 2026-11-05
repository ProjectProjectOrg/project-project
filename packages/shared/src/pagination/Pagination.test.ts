import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { decodeCursor, encodeCursor, Page, Pagination } from "./Pagination"

const decodeUnknownPaginationSync = Schema.decodeUnknownSync(Pagination)

const decodePageOfString = Schema.decodeUnknownSync(Page(Schema.String))

describe("Pagination", () => {
  it("rejects limit below 1", () => {
    const decode = Schema.decodeUnknownExit(Pagination)
    const result = decode({ limit: 0 })
    expect(result._tag).toBe("Failure")
  })

  it("accepts limit at upper bound", async () => {
    const decoded = decodeUnknownPaginationSync({ limit: 200 })
    expect(decoded.limit).toBe(200)
  })

  it("Page is a generic struct of items + nextCursor", () => {
    const decoded = decodePageOfString({
      items: ["a", "b"],
      nextCursor: null
    })
    expect(decoded.items).toEqual(["a", "b"])
    expect(decoded.nextCursor).toBeNull()
  })

  it("cursor round-trip", () => {
    const cursor = encodeCursor({
      id: "T-12",
      sort: "2026-05-11T00:00:00.000Z"
    })
    expect(decodeCursor(cursor)).toEqual({
      id: "T-12",
      sort: "2026-05-11T00:00:00.000Z"
    })
  })
})
