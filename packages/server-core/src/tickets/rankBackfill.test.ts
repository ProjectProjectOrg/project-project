import { Group, type GroupKind } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { initialRankOrder } from "./rankBackfill"

const decodeGroup = Schema.decodeUnknownSync(Group)

const group = (
  id: string,
  kind: GroupKind,
  tickets: ReadonlyArray<string>,
  dates: Readonly<{ startsAt?: string; completedAt?: string }> = {}
) =>
  decodeGroup({
    id,
    name: id,
    kind,
    tickets,
    color: "#777777",
    startsAt: dates.startsAt ?? null,
    endsAt: null,
    completedAt: dates.completedAt ?? null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  })

describe("initialRankOrder", () => {
  it("puts the active sprint first, then planned sprints by start, then the rest newest first", () => {
    const groups = [
      group("G-1", "sprint", ["T-7"], { startsAt: "2026-12-01T00:00:00.000Z" }),
      group("G-2", "sprint", ["T-5", "T-2"], {
        startsAt: "2026-11-01T00:00:00.000Z"
      }),
      group("G-3", "sprint", ["T-3", "T-9"], {
        startsAt: "2026-11-20T00:00:00.000Z"
      }),
      group("G-4", "sprint", ["T-4"], {
        startsAt: "2026-10-01T00:00:00.000Z",
        completedAt: "2026-10-15T00:00:00.000Z"
      }),
      group("G-5", "epic", ["T-6"])
    ]
    const tickets = [
      "T-1",
      "T-2",
      "T-3",
      "T-4",
      "T-5",
      "T-6",
      "T-7",
      "T-8"
    ].map((id, index) => ({ id, createdAt: index }))

    expect(
      initialRankOrder(
        groups,
        tickets,
        DateTime.toDate(DateTime.makeUnsafe("2026-11-12T00:00:00.000Z"))
      )
    ).toStrictEqual(["T-5", "T-2", "T-3", "T-7", "T-8", "T-6", "T-4", "T-1"])
  })

  it("orders tickets created at the same moment by id, whatever order the files are read in", () => {
    const at = 1_700_000_000_000
    const tickets = [
      { id: "T-2", createdAt: at },
      { id: "T-1", createdAt: at }
    ]
    const now = DateTime.toDate(DateTime.makeUnsafe(at))
    expect(initialRankOrder([], tickets, now)).toEqual(["T-1", "T-2"])
    expect(initialRankOrder([], tickets.toReversed(), now)).toEqual([
      "T-1",
      "T-2"
    ])
  })
})
