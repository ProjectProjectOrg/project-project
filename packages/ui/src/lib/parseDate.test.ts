import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import { parseDayAt, parseRangeAt } from "./parseDate"

const monday = DateTime.makeUnsafe("2026-11-09T12:00:00.000Z")

const iso = (day: DateTime.Zoned) => DateTime.formatIsoDate(day)

describe("parseDayAt", () => {
  it.each([
    ["today", "2026-11-09"],
    ["tomorrow", "2026-11-10"],
    ["fri", "2026-11-13"],
    ["monday next week", "2026-11-16"],
    ["in 3 days", "2026-11-12"],
    ["nov 20", "2026-11-20"],
    ["20 november", "2026-11-20"],
    ["20/11", "2026-11-20"],
    ["jan 5", "2027-01-05"],
    ["2026-12-01", "2026-12-01"],
    ["2026-11-01", null],
    ["soon", null]
  ])("reads %s", (input, expected) => {
    expect(Option.getOrNull(Option.map(parseDayAt(input, monday), iso))).toBe(
      expected
    )
  })

  it("allows past days when asked", () => {
    const parsed = parseDayAt("2026-11-01", monday, { allowPast: true })
    expect(Option.getOrNull(Option.map(parsed, iso))).toBe("2026-11-01")
  })
})

describe("parseRangeAt", () => {
  const range = (input: string) =>
    Option.getOrNull(
      Option.map(
        parseRangeAt(input, monday),
        ({ from, to }) =>
          `${iso(from)} ${Option.match(to, { onNone: () => "…", onSome: iso })}`
      )
    )

  it.each([
    // The end is read from the start, not from today.
    ["monday next week until two weeks later", "2026-11-16 2026-11-30"],
    ["next monday for 2 weeks", "2026-11-16 2026-11-29"],
    ["today for 3 days", "2026-11-09 2026-11-11"],
    ["nov 16 to nov 27", "2026-11-16 2026-11-27"],
    ["fri", "2026-11-13 …"],
    ["nov 27 to nov 16", null],
    ["soon", null]
  ])("reads %s", (input, expected) => {
    expect(range(input)).toBe(expected)
  })
})
