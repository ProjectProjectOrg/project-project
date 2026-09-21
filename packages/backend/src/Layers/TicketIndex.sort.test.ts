import { describe, expect, it } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import { encodeCursor, type TicketSort } from "@projectproject/shared"
import { ticketCursorCondition, ticketSortExpression } from "./TicketIndex"

const dialect = new PgDialect()

const render = (sort: TicketSort): string =>
  dialect.sqlToQuery(ticketSortExpression(sort)).sql

const renderCursor = (sort: TicketSort, id: string, value: string): string => {
  const expression = ticketSortExpression(sort)
  const condition = ticketCursorCondition(
    { sort, cursor: encodeCursor({ id, sort: value }) },
    expression
  )
  if (condition === undefined) throw new Error("no cursor condition")
  return dialect.sqlToQuery(condition).sql
}

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

describe("ticketSortExpression", () => {
  it("pins the title sort to the C collation so it matches JS code units", () => {
    expect(render({ key: "title", dir: "asc" })).toContain('collate "C"')
    expect(render({ key: "title", dir: "desc" })).toContain('collate "C"')
  })

  it("leaves the non-text sorts uncollated", () => {
    for (const key of ["id", "created", "updated", "priority"] as const) {
      expect(render({ key, dir: "asc" })).not.toContain("collate")
    }
  })
})

describe("ticketCursorCondition", () => {
  it("compares the title cursor under the same collation as the ORDER BY", () => {
    const sql = renderCursor({ key: "title", dir: "asc" }, "T-1", "beta")
    expect(occurrences(sql, 'collate "C"')).toBe(2)
  })

  it("keeps the descending title cursor collated too", () => {
    const sql = renderCursor({ key: "title", dir: "desc" }, "T-1", "beta")
    expect(occurrences(sql, 'collate "C"')).toBe(2)
  })
})
