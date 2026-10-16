import { describe, expect, it } from "vitest"

import {
  formatDuration,
  formatWorkDuration,
  parseDurationToSeconds
} from "./duration"

describe("parseDurationToSeconds", () => {
  it.each([
    ["90", 5400],
    ["1h 30m", 5400],
    ["1.5h", 5400],
    ["45m", 2700],
    ["2w 4d 6h 45m", (2 * 40 + 4 * 8 + 6) * 3600 + 45 * 60],
    ["1d", 8 * 3600],
    ["1.5d", 12 * 3600],
    ["1w2d", 56 * 3600],
    ["3D 2H", 26 * 3600]
  ])("parses %s", (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected)
  })

  it.each(["", "0", "later", "1h foo", "30m 1h", "1h 1h", "dd"])(
    "rejects %s",
    (input) => {
      expect(parseDurationToSeconds(input)).toBeNull()
    }
  )
})

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [60, "1m"],
    [3600, "1h"],
    [5460, "1h 31m"]
  ])("formats %i seconds as compact localized time", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe("formatWorkDuration", () => {
  it.each([
    [0, "0m"],
    [5400, "1h 30m"],
    [8 * 3600, "1d"],
    [(2 * 40 + 4 * 8 + 6) * 3600 + 45 * 60, "2w 4d 6h 45m"]
  ])("formats %i seconds in working weeks and days", (seconds, expected) => {
    expect(formatWorkDuration(seconds)).toBe(expected)
  })
})
