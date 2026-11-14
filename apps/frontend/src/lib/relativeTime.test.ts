import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { formatCompact } from "./relativeTime"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const now = at("2026-11-14T12:00:00Z")

describe("formatCompact", () => {
  it("shrinks to minutes, hours, a weekday, then a date", () => {
    expect(
      [
        "2026-11-14T11:59:40Z",
        "2026-11-14T11:56:00Z",
        "2026-11-14T09:00:00Z",
        "2026-11-11T12:00:00Z",
        "2026-11-01T12:00:00Z",
        "2025-11-01T12:00:00Z"
      ].map((iso) => formatCompact(at(iso), now))
    ).toEqual(["now", "4m", "3h", "Wed", "Nov 1", "Nov 1, 2025"])
  })
})
