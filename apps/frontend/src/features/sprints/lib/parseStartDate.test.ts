import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { parseStartDate } from "./parseStartDate"

const monday = DateTime.makeUnsafe("2026-11-09T12:00:00.000Z")

const day = (date: Date | null) =>
  date === null
    ? null
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

describe("parseStartDate", () => {
  it.each([
    ["today", "2026-11-09"],
    ["tomorrow", "2026-11-10"],
    ["fri", "2026-11-13"],
    ["next friday", "2026-11-13"],
    ["monday", "2026-11-16"],
    ["next week", "2026-11-16"],
    ["in 3 days", "2026-11-12"],
    ["in 4 da", "2026-11-13"],
    ["3 wee", "2026-11-30"],
    ["tom", "2026-11-10"],
    ["frid", "2026-11-13"],
    ["2w", "2026-11-23"],
    ["nov 20", "2026-11-20"],
    ["20 november", "2026-11-20"],
    ["20/11", "2026-11-20"],
    ["jan 5", "2027-01-05"],
    ["2026-12-01", "2026-12-01"],
    ["2026-11-01", null],
    ["31/2", null],
    ["soon", null]
  ])("reads %s", (input, expected) => {
    expect(day(parseStartDate(input, monday))).toBe(expected)
  })
})
