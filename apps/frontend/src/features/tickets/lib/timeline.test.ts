import type { TicketActivityEntry } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  timelineEvents,
  timelineRows,
  TimelineRow,
  type TimelineOrder
} from "./timeline"

const at = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  // @effect-diagnostics-next-line globalDate:off
  return new Date(2026, 10, 5, hour, minute)
}

const entry = (id: string, time: string) =>
  ({
    kind: "change",
    id,
    occurredAt: at(time),
    actor: { kind: "system", source: "automation" },
    cause: null,
    change: { kind: "description_edited" }
  }) satisfies TicketActivityEntry

const comment = (key: string, time: string, lastTime = time) => ({
  key,
  at: at(time),
  lastAt: at(lastTime),
  appear: false,
  value: key
})

const rows = (
  activity: ReadonlyArray<TicketActivityEntry>,
  comments: ReadonlyArray<ReturnType<typeof comment>>,
  hasOlder = false,
  order: TimelineOrder = "asc"
) => timelineRows(timelineEvents({ activity, comments, hasOlder }), order)

const shape = (...args: Parameters<typeof rows>) =>
  rows(...args).map((row) =>
    TimelineRow.$is("comment")(row)
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

  it("lists rows newest first when descending", () => {
    expect(
      shape(
        [entry("c", "10:20"), entry("b", "10:10"), entry("a", "10:00")],
        [comment("note", "10:05")],
        false,
        "desc"
      )
    ).toEqual(["b:0,c:0", "note", "a:0"])
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

  it("keeps an old thread whose latest reply is within the loaded activity", () => {
    expect(
      shape([entry("b", "10:10")], [comment("thread", "09:00", "10:20")], true)
    ).toEqual(["thread", "b:0"])
  })

  it("folds older runs whole and the newest run up to its last two changes", () => {
    const entries = (prefix: string, hour: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        entry(`${prefix}${index}`, `${hour}:${10 + index}`)
      ).toReversed()
    const folds = rows(
      [...entries("n", 12, 5), ...entries("m", 11, 4), ...entries("o", 10, 3)],
      [comment("note", "11:00"), comment("later", "12:00")]
    ).map((row) =>
      TimelineRow.$match(row, {
        run: ({ fold }) => fold,
        comment: ({ comment }) => comment.key
      })
    )
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
    ).map((row) =>
      TimelineRow.$match(row, {
        run: ({ fold }) => fold,
        comment: ({ comment }) => comment.key
      })
    )
    expect(folds).toEqual([0])
  })
})
