import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { sprintDateDraft, sprintDatesPatch } from "./sprintDates"

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
