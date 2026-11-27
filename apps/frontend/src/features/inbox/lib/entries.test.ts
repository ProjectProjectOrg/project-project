import {
  InboxEntry,
  type InboxEntryKind,
  type InboxEntryState
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  deleteEntry,
  isDeleted,
  markAllEntriesRead,
  markEntryRead,
  markEntryUnread,
  unreadCount,
  withStatus
} from "./entries"

const decode = Schema.decodeUnknownSync(InboxEntry)

const entry = (
  id: string,
  kind: InboxEntryKind,
  state: InboxEntryState,
  minute = 0
) =>
  decode({
    id,
    revision: 2,
    kind,
    state,
    clearedBy: null,
    ticket: { id: "PP-1", title: "Inbox", projectSlug: "pp" },
    actor: null,
    latest:
      kind === "assigned"
        ? { kind: "assigned" }
        : { kind: "mentioned", commentId: "c1" },
    latestAt: `2026-11-27T09:${String(minute).padStart(2, "0")}:00.000Z`,
    commentId: null,
    excerpt: null,
    eventCount: state === "unread" ? 2 : 0,
    readByClientName: null
  })

const mention = entry("e1", "mentioned", "unread", 5)
const assignment = entry("e2", "assigned", "unread", 10)
const entries = [mention, assignment]

describe("markEntryRead", () => {
  it("keeps a mention, without its dot", () => {
    expect(markEntryRead(entries, mention.id)[0]).toMatchObject({
      state: "read",
      clearedBy: null,
      eventCount: 0
    })
  })

  it("clears an assignment", () => {
    expect(markEntryRead(entries, assignment.id)[1]).toMatchObject({
      state: "cleared",
      clearedBy: "read"
    })
  })
})

describe("markEntryUnread", () => {
  it("puts the dot back", () => {
    const read = markEntryRead(entries, assignment.id)
    expect(markEntryUnread(read, read[1])[1]).toMatchObject({
      state: "unread",
      clearedBy: null,
      eventCount: 1
    })
  })

  it("puts back an entry the list no longer has", () => {
    const cleared = { ...assignment, state: "cleared" as const }
    expect(markEntryUnread([mention], cleared)).toMatchObject([
      { id: assignment.id, state: "unread" },
      { id: mention.id }
    ])
  })
})

describe("withStatus", () => {
  it("takes the server's state", () => {
    expect(
      withStatus(entries, {
        id: mention.id,
        state: "read",
        clearedBy: null,
        revision: 2
      })[0]
    ).toMatchObject({ state: "read" })
  })

  it("ignores a status older than the entry", () => {
    const next = withStatus(entries, {
      id: mention.id,
      state: "read",
      clearedBy: null,
      revision: 1
    })
    expect(next[0]).toBe(mention)
  })
})

describe("deleteEntry", () => {
  it("marks the entry deleted, and the server confirms it", () => {
    const predicted = deleteEntry(entries, mention)
    expect(isDeleted(predicted[0])).toBe(true)
    const confirmed = withStatus(predicted, {
      id: mention.id,
      state: "cleared",
      clearedBy: "deleted",
      revision: 2
    })
    expect(isDeleted(confirmed[0])).toBe(true)
  })

  it("brings back an entry the server kept because of newer activity", () => {
    const predicted = deleteEntry(entries, mention)
    expect(
      withStatus(predicted, {
        id: mention.id,
        state: "unread",
        clearedBy: null,
        revision: 3
      })[0]
    ).toMatchObject({ state: "unread", clearedBy: null, revision: 3 })
  })
})

describe("markAllEntriesRead", () => {
  it("reads only what arrived up to the moment", () => {
    const upTo = DateTime.toDate(
      DateTime.makeUnsafe("2026-11-27T09:07:00.000Z")
    )
    expect(markAllEntriesRead(entries, upTo).map((item) => item.state)).toEqual(
      ["read", "unread"]
    )
  })
})

describe("unreadCount", () => {
  it("counts what is still unread", () => {
    expect(unreadCount(entries)).toBe(2)
    expect(unreadCount(deleteEntry(entries, mention))).toBe(1)
  })
})
