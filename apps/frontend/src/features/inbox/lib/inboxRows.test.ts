import { InboxItem } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  afterRemoving,
  inboxKey,
  readAllRows,
  seenUntil,
  stepRow,
  unreadRow
} from "./inboxRows"

const decodeItem = Schema.decodeUnknownSync(InboxItem)

const item = (id: string, unread: boolean) =>
  decodeItem({
    projectSlug: "web",
    ticket: { id, title: id, status: "todo", archived: false },
    unread,
    direct: [],
    latest: { kind: "assigned" },
    latestAt: "2026-11-01T00:00:00.000Z",
    firstAt: "2026-10-31T00:00:00.000Z",
    actor: null,
    unreadCount: unread ? 2 : 0,
    lastReadAt: null
  })

const rows = [item("T-1", true), item("T-2", false), item("T-3", true)]

describe("inbox rows", () => {
  it("mark all read clears every unread row and stamps when", () => {
    const at = DateTime.toDate(DateTime.makeUnsafe(1))
    expect(
      readAllRows(rows, at).map((row) => [row.unread, row.lastReadAt])
    ).toEqual([
      [false, at],
      [false, null],
      [false, at]
    ])
  })

  it("a row never read counts its first event as new", () => {
    const row = item("T-9", true)
    expect(seenUntil(row).getTime()).toBe(row.firstAt.getTime() - 1)
    const at = DateTime.toDate(DateTime.makeUnsafe(1))
    expect(readAllRows([row], at).map(seenUntil)).toEqual([at])
  })

  it("marking unread counts at least one event", () => {
    expect(unreadRow(rows, "web/T-2")[1]).toMatchObject({
      unread: true,
      unreadCount: 1
    })
  })

  it("j and k stop at the ends and start at the top", () => {
    const step = (current: string | null, by: 1 | -1) => {
      const next = stepRow(rows, current, by)
      return next === null ? null : inboxKey(next)
    }
    expect(step(null, 1)).toBe("web/T-1")
    expect(step("web/T-3", 1)).toBe("web/T-3")
    expect(step("web/T-1", -1)).toBe("web/T-1")
    expect(step("web/T-1", 1)).toBe("web/T-2")
  })

  it("removing a row selects the one below, or above at the end", () => {
    expect(afterRemoving(rows, "web/T-2")?.ticket.id).toBe("T-3")
    expect(afterRemoving(rows, "web/T-3")?.ticket.id).toBe("T-2")
    expect(afterRemoving(rows.slice(0, 1), "web/T-1")).toBeNull()
  })
})
