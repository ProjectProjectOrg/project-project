import {
  InboxEntry,
  type InboxEntryKind,
  type InboxEntryState
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { groupByDay, rememberEntries, shownEntries, stepEntry } from "./visit"

const decode = Schema.decodeUnknownSync(InboxEntry)

const entry = (
  id: string,
  kind: InboxEntryKind,
  state: InboxEntryState,
  at: string
) =>
  decode({
    id,
    revision: 1,
    kind,
    state,
    clearedBy: null,
    ticket: { id: "PP-1", title: "Inbox", projectSlug: "pp" },
    actor: null,
    latest:
      kind === "assigned"
        ? { kind: "assigned" }
        : { kind: "mentioned", commentId: "c1" },
    latestAt: at,
    commentId: null,
    excerpt: null,
    eventCount: 1,
    readByClientName: null
  })

const mention = entry("m", "mentioned", "unread", "2026-11-27T09:30:00.000Z")
const assignment = entry("a", "assigned", "unread", "2026-11-27T09:20:00.000Z")
const update = entry("u", "updates", "unread", "2026-11-26T15:00:00.000Z")
const all = [mention, assignment, update]
const seen = rememberEntries(new Map(), all)

describe("shownEntries", () => {
  it("shows the latest entries newest first", () => {
    expect(
      shownEntries(seen, all, null).map((shown) => shown.entry.id)
    ).toEqual(["m", "a", "u"])
  })

  it("keeps a read assignment or update as read until the visit ends", () => {
    const shown = shownEntries(seen, [mention], null)
    expect(shown.map((item) => [item.entry.id, item.entry.state])).toEqual([
      ["m", "unread"],
      ["a", "cleared"],
      ["u", "cleared"]
    ])
  })

  it("keeps a cleared mention in place, resolved, while it is selected", () => {
    const shown = shownEntries(seen, [assignment, update], mention.id)
    expect(shown[0]).toMatchObject({ entry: { id: "m" }, resolved: true })
  })

  it("drops the cleared mention once another entry is selected", () => {
    expect(
      shownEntries(seen, [assignment, update], assignment.id).map(
        (shown) => shown.entry.id
      )
    ).toEqual(["a", "u"])
  })

  it("hides an entry the person deleted, before and after the refetch", () => {
    const deleted = {
      ...assignment,
      state: "cleared" as const,
      clearedBy: "deleted" as const
    }
    const after = rememberEntries(seen, [mention, deleted, update])
    const ids = (latest: ReadonlyArray<typeof mention>) =>
      shownEntries(after, latest, null).map((shown) => shown.entry.id)
    expect(ids([mention, deleted, update])).toEqual(["m", "u"])
    expect(ids([mention, update])).toEqual(["m", "u"])
  })
})

describe("groupByDay", () => {
  it("splits today from earlier", () => {
    const shown = shownEntries(seen, all, null)
    const now = DateTime.toDate(DateTime.makeUnsafe("2026-11-27T12:00:00.000Z"))
    const groups = groupByDay(shown, now)
    expect(groups.today.map((item) => item.entry.id)).toEqual(["m", "a"])
    expect(groups.earlier.map((item) => item.entry.id)).toEqual(["u"])
  })
})

describe("stepEntry", () => {
  const shown = shownEntries(seen, all, null)

  it("starts at the top or bottom when nothing is selected", () => {
    expect(stepEntry(shown, null, 1)?.id).toBe("m")
    expect(stepEntry(shown, null, -1)?.id).toBe("u")
  })

  it("moves one step and stops at the ends", () => {
    expect(stepEntry(shown, mention.id, 1)?.id).toBe("a")
    expect(stepEntry(shown, mention.id, -1)?.id).toBe("m")
    expect(stepEntry(shown, update.id, 1)?.id).toBe("u")
  })

  it("has nothing to step to in an empty inbox", () => {
    expect(stepEntry([], null, 1)).toBeNull()
  })
})
