import { InboxItem } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { afterRemoving, inboxKey, seenUntil, stepRow } from "./inboxRows"

const decodeItem = Schema.decodeUnknownSync(InboxItem)

const item = (
  id: string,
  unread: boolean,
  latestAt = "2026-11-01T00:00:00.000Z"
) =>
  decodeItem({
    projectSlug: "web",
    ticket: { id, title: id, status: "todo", archived: false },
    unread,
    direct: [],
    latest: { kind: "assigned" },
    latestAt,
    firstAt: "2026-10-31T00:00:00.000Z",
    actor: null,
    unreadCount: unread ? 2 : 0,
    lastReadAt: null
  })

const rows = [item("T-1", true), item("T-2", false), item("T-3", true)]

describe("inbox rows", () => {
  it("a row never read counts its first event as new", () => {
    const row = item("T-9", true)
    const commentSavedJustBefore = row.firstAt.getTime() - 10
    expect(seenUntil(row).getTime()).toBeLessThan(commentSavedJustBefore)
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
