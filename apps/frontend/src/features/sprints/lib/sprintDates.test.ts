import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  defaultSprintRange,
  formatSprintRange,
  sprintDateDraft,
  sprintCountdown,
  sprintDatesPatch,
  sprintElapsed,
  startPresets,
  startSprintPatch
} from "./sprintDates"

const date = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const may1 = date("2026-05-01T00:00:00.000Z")
const may14 = date("2026-05-14T00:00:00.000Z")
const may21 = date("2026-05-21T00:00:00.000Z")

describe("sprintDateDraft", () => {
  it("opens the picker on the saved range", () => {
    expect(sprintDateDraft({ startsAt: may1, endsAt: may14 })).toEqual({
      from: may1,
      to: may14
    })
  })

  it("leaves unset dates empty", () => {
    expect(sprintDateDraft({ startsAt: null, endsAt: null })).toEqual({
      from: undefined,
      to: undefined
    })
  })
})

describe("sprintDatesPatch", () => {
  const sprint = { startsAt: may1, endsAt: may14 }

  it("sends nothing when the range is unchanged", () => {
    expect(
      sprintDatesPatch(sprint, {
        from: date("2026-05-01T00:00:00.000Z"),
        to: date("2026-05-14T00:00:00.000Z")
      })
    ).toBeNull()
  })

  it("sends both dates when the end moves", () => {
    expect(sprintDatesPatch(sprint, { from: may1, to: may21 })).toEqual({
      startsAt: may1,
      endsAt: may21
    })
  })

  it("clears dates the draft no longer holds", () => {
    expect(sprintDatesPatch(sprint, { from: may1, to: undefined })).toEqual({
      startsAt: may1,
      endsAt: null
    })
  })

  it("sends nothing for an empty draft on an undated sprint", () => {
    expect(sprintDatesPatch({ startsAt: null, endsAt: null }, {})).toBeNull()
  })
})

describe("formatSprintRange", () => {
  it("prints both ends as short month and day", () => {
    expect(
      formatSprintRange(
        date("2026-05-01T12:00:00.000Z"),
        date("2026-05-14T12:00:00.000Z")
      )
    ).toBe("May 1 – May 14")
  })
})

const localDay = (value: Date | null | undefined) =>
  value == null
    ? null
    : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

const noon = (day: string) => date(`${day}T12:00:00.000Z`)

describe("defaultSprintRange", () => {
  it("runs fourteen days, today included", () => {
    const range = defaultSprintRange(
      DateTime.makeUnsafe("2026-05-01T12:00:00.000Z")
    )
    expect([localDay(range.from), localDay(range.to)]).toEqual([
      "2026-05-01",
      "2026-05-14"
    ])
  })
})

describe("startSprintPatch", () => {
  it("keeps the planned number of days when moving the start", () => {
    const patch = startSprintPatch(
      { startsAt: noon("2026-05-14"), endsAt: noon("2026-05-21") },
      noon("2026-05-01")
    )
    expect([localDay(patch.startsAt), localDay(patch.endsAt)]).toEqual([
      "2026-05-01",
      "2026-05-08"
    ])
  })

  it("runs fourteen days when the sprint has no range", () => {
    const patch = startSprintPatch(
      { startsAt: null, endsAt: null },
      noon("2026-05-01")
    )
    expect([localDay(patch.startsAt), localDay(patch.endsAt)]).toEqual([
      "2026-05-01",
      "2026-05-14"
    ])
  })
})

describe("sprintCountdown", () => {
  const endsAt = noon("2026-05-14")
  it.each([
    ["2026-05-12", { kind: "left", days: 2 }],
    ["2026-05-14", { kind: "lastDay" }],
    ["2026-05-16", { kind: "ended", days: 2 }]
  ])("on %s", (today, expected) => {
    expect(sprintCountdown({ endsAt }, noon(today))).toEqual(expected)
  })
})

describe("sprintElapsed", () => {
  const sprint = { startsAt: noon("2026-05-01"), endsAt: noon("2026-05-14") }
  it.each([
    ["2026-04-28", 0],
    ["2026-05-08", 0.5],
    ["2026-05-20", 1]
  ])("on %s", (today, expected) => {
    expect(sprintElapsed(sprint, noon(today))).toBe(expected)
  })
})

describe("startPresets", () => {
  it("offers each day once, starting now", () => {
    const monday = DateTime.makeUnsafe("2026-11-09T12:00:00.000Z")
    const presets = startPresets({ now: monday, activeEnd: null })
    expect(presets.map((preset) => preset.key)).toEqual([
      "now",
      "tomorrow",
      "monday",
      "mondayAfter"
    ])
    expect(presets[2]?.date.getDate()).toBe(16)
  })

  it("starts the day after the active sprint ends, over a Monday on that day", () => {
    const monday = DateTime.makeUnsafe("2026-11-09T12:00:00.000Z")
    const activeEnd = noon("2026-11-22")
    expect(
      startPresets({ now: monday, activeEnd }).map((preset) => preset.key)
    ).toEqual(["now", "tomorrow", "monday", "afterActive"])
  })

  it("drops a preset that lands on a day already offered", () => {
    const sunday = DateTime.makeUnsafe("2026-11-08T12:00:00.000Z")
    expect(startPresets({ now: sunday }).map((preset) => preset.key)).toEqual([
      "now",
      "tomorrow",
      "mondayAfter"
    ])
  })
})
