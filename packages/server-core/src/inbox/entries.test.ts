import type { TicketActivityOutboxActor } from "@pp/db/schema"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  assignedKey,
  deliver,
  descriptionMentionKey,
  kindOfKey,
  markUnread,
  mentionKey,
  read,
  remove,
  resolve,
  threadMentionKey,
  updatesKey,
  type EntryValue
} from "./entries"

const maya: TicketActivityOutboxActor = {
  actorKind: "user",
  actorUserId: "maya"
}

const at = (minute: number) =>
  DateTime.toDate(
    DateTime.makeUnsafe(
      `2026-11-27T09:${String(minute).padStart(2, "0")}:00.000Z`
    )
  )

const mention = (entry: EntryValue | null, minute: number) =>
  deliver(entry, {
    key: threadMentionKey("c1"),
    event: { kind: "mentioned", commentId: `c${minute}` },
    commentId: `c${minute}`,
    at: at(minute),
    actor: maya
  })

const assignment = (entry: EntryValue | null, minute: number) =>
  deliver(entry, {
    key: assignedKey,
    event: { kind: "assigned" },
    commentId: null,
    at: at(minute),
    actor: maya
  })

const update = (entry: EntryValue | null, minute: number) =>
  deliver(entry, {
    key: updatesKey,
    event: { kind: "commented", commentId: `c${minute}` },
    commentId: `c${minute}`,
    at: at(minute),
    actor: maya
  })

describe("keys", () => {
  it("names one entry per reason, and one per mention thread", () => {
    expect(mentionKey("c1")).toBe("mention:thread:c1")
    expect(mentionKey(null)).toBe(descriptionMentionKey)
    expect(kindOfKey(assignedKey)).toBe("assigned")
    expect(kindOfKey(updatesKey)).toBe("updates")
    expect(kindOfKey(threadMentionKey("c9"))).toBe("mentioned")
  })
})

describe("deliver", () => {
  it("opens a new entry unread at revision 1", () => {
    expect(mention(null, 1)).toMatchObject({
      kind: "mentioned",
      state: "unread",
      revision: 1,
      eventCount: 1,
      commentId: "c1"
    })
  })

  it("counts events while unread and moves the entry up", () => {
    const again = mention(mention(null, 1), 2)
    expect(again).toMatchObject({
      revision: 2,
      eventCount: 2,
      latestAt: at(2),
      commentId: "c2"
    })
  })

  it("keeps the newest event when an older one arrives late", () => {
    const late = mention(mention(null, 5), 3)
    expect(late).toMatchObject({ latestAt: at(5), revision: 2 })
  })

  it("never reopens an entry read after newer activity for a late older event", () => {
    const seen = read(mention(null, 5), 1, null)
    expect(mention(seen, 3)).toBe(seen)
  })

  it("brings a deleted entry back as unread", () => {
    const deleted = remove(mention(null, 1), 1)
    expect(mention(deleted, 2)).toMatchObject({
      state: "unread",
      clearedBy: null,
      eventCount: 1,
      revision: 2
    })
  })
})

describe("read", () => {
  it("keeps a mention in the inbox, without its dot", () => {
    expect(read(mention(null, 1), 1, null)).toMatchObject({
      state: "read",
      clearedBy: null,
      readRevision: 1,
      eventCount: 0
    })
  })

  it("clears an assignment and an updates rollup", () => {
    expect(read(assignment(null, 1), 1, null)).toMatchObject({
      state: "cleared",
      clearedBy: "read"
    })
    expect(read(update(null, 1), 1, null)).toMatchObject({
      state: "cleared",
      clearedBy: "read"
    })
  })

  it("does nothing when the entry has newer activity than the reader saw", () => {
    const entry = mention(mention(null, 1), 2)
    expect(read(entry, 1, null)).toBe(entry)
  })

  it("records the agent that read it", () => {
    expect(read(update(null, 1), 1, "Claude Code")).toMatchObject({
      readByClientName: "Claude Code"
    })
  })
})

describe("markUnread and remove", () => {
  it("puts the dot back", () => {
    const entry = read(assignment(null, 1), 1, null)
    expect(markUnread(entry)).toMatchObject({
      state: "unread",
      clearedBy: null,
      eventCount: 1
    })
  })

  it("deletes only the revision the person saw", () => {
    const entry = mention(mention(null, 1), 2)
    expect(remove(entry, 1)).toBe(entry)
    expect(remove(entry, 2)).toMatchObject({
      state: "cleared",
      clearedBy: "deleted"
    })
  })
})

describe("resolve", () => {
  it("clears a mention thread when its person replies there", () => {
    expect(
      resolve(
        mention(null, 1),
        threadMentionKey("c1"),
        "bob",
        [{ kind: "replied", userId: "bob", threadId: "c1" }],
        at(2)
      )
    ).toMatchObject({ state: "cleared", clearedBy: "replied" })
  })

  it("leaves other threads and other people alone", () => {
    const entry = mention(null, 1)
    expect(
      resolve(
        entry,
        threadMentionKey("c1"),
        "bob",
        [
          { kind: "replied", userId: "bob", threadId: "c7" },
          { kind: "replied", userId: "carl", threadId: "c1" }
        ],
        at(2)
      )
    ).toBe(entry)
  })

  it("clears an assignment when the person is unassigned", () => {
    expect(
      resolve(
        assignment(null, 1),
        assignedKey,
        "bob",
        [{ kind: "unassigned", userId: "bob" }],
        at(2)
      )
    ).toMatchObject({ state: "cleared", clearedBy: "unassigned" })
  })

  it("clears direct entries but not updates when the ticket is finished", () => {
    const finished = [{ kind: "finished" } as const]
    expect(
      resolve(assignment(null, 1), assignedKey, "bob", finished, at(2))
    ).toMatchObject({ clearedBy: "finished" })
    const updates = update(null, 1)
    expect(resolve(updates, updatesKey, "bob", finished, at(2))).toBe(updates)
  })

  it("a delivery older than the resolution never reopens the entry", () => {
    const resolved = resolve(
      mention(null, 1),
      threadMentionKey("c1"),
      "bob",
      [{ kind: "replied", userId: "bob", threadId: "c1" }],
      at(5)
    )
    expect(mention(resolved, 3)).toBe(resolved)
    expect(mention(resolved, 6)).toMatchObject({ state: "unread" })
  })

  it("ignores a resolution older than the entry's latest event", () => {
    const entry = mention(null, 5)
    expect(
      resolve(
        entry,
        threadMentionKey("c1"),
        "bob",
        [{ kind: "replied", userId: "bob", threadId: "c1" }],
        at(3)
      )
    ).toBe(entry)
  })
})
