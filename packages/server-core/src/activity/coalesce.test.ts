import {
  ActivityActor,
  TicketStatus,
  type ActivityActorShape,
  type ActivityCause,
  type TicketActivityChange
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { coalesceActivity } from "./coalesce"
import type { StoredTicketActivity } from "./TicketActivity"

const status = Schema.decodeUnknownSync(TicketStatus)
const wouter = ActivityActor.user("wouter")
const luuk = ActivityActor.user("luuk")
const start = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2026-10-16T09:00:00Z")
)

let sequence = 0
const entry = (
  secondsAfterStart: number,
  change: TicketActivityChange,
  actor: ActivityActorShape = wouter,
  cause: ActivityCause | null = null
): StoredTicketActivity => {
  sequence += 1
  return {
    id: `a${sequence}`,
    seq: sequence,
    occurredAt: DateTime.toDate(
      DateTime.makeUnsafe(start + secondsAfterStart * 1000)
    ),
    actor,
    cause,
    change
  }
}

const moved = (from: string, to: string): TicketActivityChange => ({
  kind: "status_changed",
  from: status(from),
  to: status(to)
})
const edited: TicketActivityChange = { kind: "description_edited" }

const newestFirst = (entries: ReadonlyArray<StoredTicketActivity>) =>
  [...entries].reverse()

describe("coalesceActivity", () => {
  it("collapses a burst of description edits by one person", () => {
    const first = entry(0, edited)
    const second = entry(5 * 60, edited)
    const third = entry(14 * 60, edited)
    expect(coalesceActivity(newestFirst([first, second, third]))).toEqual([
      third
    ])
  })

  it("keeps description edits more than ten minutes apart", () => {
    const first = entry(0, edited)
    const second = entry(11 * 60, edited)
    expect(coalesceActivity(newestFirst([first, second]))).toEqual([
      second,
      first
    ])
  })

  it("keeps description edits by different people", () => {
    const first = entry(0, edited, luuk)
    const second = entry(60, edited)
    expect(coalesceActivity(newestFirst([first, second]))).toEqual([
      second,
      first
    ])
  })

  it("drops a status change that was reverted within a minute", () => {
    const there = entry(0, moved("todo", "in_progress"))
    const back = entry(20, moved("in_progress", "todo"))
    const kept = entry(30, { kind: "title_changed", from: "a", to: "b" })
    expect(coalesceActivity(newestFirst([there, back, kept]))).toEqual([kept])
  })

  it("merges quick successive status changes into one", () => {
    const first = entry(0, moved("todo", "in_progress"))
    const second = entry(30, moved("in_progress", "done"))
    expect(coalesceActivity(newestFirst([first, second]))).toEqual([
      { ...second, change: moved("todo", "done") }
    ])
  })

  it("does not merge across another person's change of the same field", () => {
    const first = entry(0, moved("todo", "in_progress"))
    const other = entry(10, moved("in_progress", "done"), luuk)
    const third = entry(20, moved("done", "todo"))
    expect(coalesceActivity(newestFirst([first, other, third]))).toEqual([
      third,
      other,
      first
    ])
  })

  it("keeps changes with different causes apart", () => {
    const manual = entry(0, moved("todo", "review"))
    const remapped = entry(
      10,
      moved("review", "todo"),
      wouter,
      "status_removed"
    )
    expect(coalesceActivity(newestFirst([manual, remapped]))).toEqual([
      remapped,
      manual
    ])
  })
})
