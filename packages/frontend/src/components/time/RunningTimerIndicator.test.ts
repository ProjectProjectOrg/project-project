import { describe, expect, it } from "vitest"
import { formatClock } from "./RunningTimerIndicator"

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [65, "1:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"]
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected)
  })
})
