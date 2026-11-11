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

const rows = (
  activity: ReadonlyArray<TicketActivityEntry>,
  comments: ReadonlyArray<ReturnType<typeof comment>>,
  hasOlder = false
) => timelineRows(timelineEvents({ activity, comments, hasOlder }))

const shape = (...args: Parameters<typeof rows>) =>
  rows(...args).map((row) =>
    row.kind === "comment"
      ? row.comment.key
      : row.lines.map((line) => line.key).join(",")
  )

describe("timeline", () => {
  it("runs oldest to newest with comments between the changes", () => {
    expect(
      shape(
        [entry("c", "10:20"), entry("b", "10:10"), entry("a", "10:00")],
        [comment("note", "10:05")]
      )
    ).toEqual(["a:0", "note", "b:0,c:0"])
  })

  it("holds back comments older than the loaded activity", () => {
    expect(
      shape(
        [entry("b", "10:10")],
        [comment("old", "09:00"), comment("new", "10:30")],
        true
      )
    ).toEqual(["b:0", "new"])
  })

  it("folds older runs whole and the newest run up to its last two changes", () => {
    const entries = (prefix: string, hour: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        entry(`${prefix}${index}`, `${hour}:${10 + index}`)
      ).toReversed()
    const folds = rows(
      [...entries("n", 12, 5), ...entries("m", 11, 4), ...entries("o", 10, 3)],
      [comment("note", "11:00"), comment("later", "12:00")]
    ).map((row) => (row.kind === "run" ? row.fold : row.comment.key))
    expect(folds).toEqual([3, "note", 4, "later", 3])
  })

  it("keeps a short newest run fully open", () => {
    const folds = rows(
      [
        entry("d", "10:04"),
        entry("c", "10:03"),
        entry("b", "10:02"),
        entry("a", "10:01")
      ],
      []
    ).map((row) => (row.kind === "run" ? row.fold : row.comment.key))
    expect(folds).toEqual([0])
  })
})
