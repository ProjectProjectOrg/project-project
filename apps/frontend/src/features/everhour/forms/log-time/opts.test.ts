import { GroupId, TicketId } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { toLogTimeInput } from "./opts"

const values = {
  duration: "1h 30m",
  date: "2026-10-26",
  workType: "development",
  note: "  pairing  "
}

describe("toLogTimeInput", () => {
  it("parses the duration and trims the note into a comment", () => {
    expect(toLogTimeInput(values, { ticketId: null, groupId: null })).toEqual({
      workTypeKey: "development",
      seconds: 5400,
      date: "2026-10-26",
      comment: "pairing",
      ticketId: null,
      groupId: undefined
    })
  })

  it("drops a blank note", () => {
    expect(
      toLogTimeInput(
        { ...values, note: "   " },
        { ticketId: null, groupId: null }
      )?.comment
    ).toBeUndefined()
  })

  it("logs against the sprint only when there is no ticket", () => {
    const groupId = GroupId.make("G-1")
    expect(toLogTimeInput(values, { ticketId: null, groupId })?.groupId).toBe(
      groupId
    )
    expect(
      toLogTimeInput(values, { ticketId: TicketId.make("PP-1"), groupId })
        ?.groupId
    ).toBeUndefined()
  })

  it("returns null for a duration that does not parse", () => {
    expect(
      toLogTimeInput(
        { ...values, duration: "soon" },
        { ticketId: null, groupId: null }
      )
    ).toBeNull()
  })
})
