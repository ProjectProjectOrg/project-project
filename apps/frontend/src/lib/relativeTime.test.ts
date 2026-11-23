import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { formatRelative } from "./relativeTime"

const now = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-23T12:00:00Z"))
const ago = (seconds: number) =>
  DateTime.toDate(DateTime.makeUnsafe(now - seconds * 1000))

describe("formatRelative", () => {
  it("reads just now for the first minute and a moment ahead", () => {
    expect(formatRelative(ago(0), now)).toBe("just now")
    expect(formatRelative(ago(59), now)).toBe("just now")
    expect(formatRelative(ago(-3), now)).toBe("just now")
  })

  it("counts minutes beyond a minute either way", () => {
    expect(formatRelative(ago(60), now)).toBe("1 minute ago")
    expect(formatRelative(ago(5 * 60), now)).toBe("5 minutes ago")
    expect(formatRelative(ago(-2 * 60), now)).toBe("in 2 minutes")
  })
})
