import { describe, expect, it } from "vitest"
import { parseDurationToSeconds } from "./LogTimeForm"

describe("parseDurationToSeconds", () => {
  it.each([
    ["90", 5400],
    ["1h 30m", 5400],
    ["1.5h", 5400],
    ["45m", 2700]
  ])("parses %s", (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected)
  })

  it.each(["", "0", "later"])("rejects %s", (input) => {
    expect(parseDurationToSeconds(input)).toBeNull()
  })
})
