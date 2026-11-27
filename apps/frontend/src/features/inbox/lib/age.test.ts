import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { compactAge } from "./age"

const now = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-27T12:00:00Z"))
const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const age = (iso: string) => compactAge(at(iso), now, "en", "now")

describe("compactAge", () => {
  it("says now for the last minute", () => {
    expect(age("2026-11-27T11:59:30Z")).toBe("now")
  })

  it("counts minutes, hours and days in their short forms", () => {
    expect(age("2026-11-27T11:58:00Z")).toBe("2m")
    expect(age("2026-11-27T09:00:00Z")).toBe("3h")
    expect(age("2026-11-25T12:00:00Z")).toBe("2d")
  })

  it("names the date after a week", () => {
    expect(age("2026-11-03T12:00:00Z")).toBe("Nov 3")
  })
})
