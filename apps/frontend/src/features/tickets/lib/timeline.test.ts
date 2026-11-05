import type { TicketActivityEntry } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { timelineEvents, timelineRows } from "./timeline"

const at = (time: string): Date => {
  const [hour, minute] = time.split(":").map(Number)
  // @effect-diagnostics-next-line globalDate:off
  return new Date(2026, 10, 5, hour, minute)
}

const entry = (id: string, time: string): TicketActivityEntry => ({
  kind: "change",
  id,
  occurredAt: at(time),
  actor: { kind: "system", source: "automation" },
  cause: null,
  change: { kind: "description_edited" }
})

const comment = (key: string, time: string) => ({
  key,
  at: at(time),
  value: key
})

const shape = (
  activity: ReadonlyArray<TicketActivityEntry>,
  comments: ReadonlyArray<ReturnType<typeof comment>>,
  hasOlder: boolean
) =>
  timelineRows(timelineEvents({ activity, comments, hasOlder })).map((row) =>
    row.kind === "comment" ? row.comment.key : row.key
  )

describe("timeline", () => {
  it("runs oldest to newest with comments between the changes", () => {
    expect(
      shape(
        [entry("c", "10:20"), entry("b", "10:10"), entry("a", "10:00")],
        [comment("note", "10:05")],
        false
      )
    ).toEqual(["a", "note", "b", "c"])
  })

  it("holds back comments older than the loaded activity", () => {
    expect(
      shape(
        [entry("b", "10:10")],
        [comment("old", "09:00"), comment("new", "10:30")],
        true
      )
    ).toEqual(["b", "new"])
  })
})
