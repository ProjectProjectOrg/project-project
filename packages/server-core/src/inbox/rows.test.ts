import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { deliver, read, resolve, type Delivery } from "./rows"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const actor = {
  actorKind: "user" as const,
  actorUserId: "ann",
  actorClientId: null,
  actorClientName: null,
  actorSource: null
}

const mention: Delivery = {
  event: { kind: "mentioned", commentId: "c1" },
  direct: [
    { reason: "mentioned", at: "2026-11-13T10:00:00.000Z", commentId: "c1" }
  ],
  at: at("2026-11-13T10:00:00Z"),
  actor
}

const comment: Delivery = {
  event: { kind: "commented", commentId: "c2" },
  direct: [],
  at: at("2026-11-13T11:00:00Z"),
  actor
}

describe("inbox rows", () => {
  it("keeps the mention when a newer subscriber event arrives and counts both", () => {
    const row = deliver(deliver(null, mention), comment)
    expect(row).toMatchObject({
      state: "unread",
      latest: { kind: "commented" },
      unreadCount: 2,
      direct: [{ reason: "mentioned" }]
    })
  })

  it("marks a row done once its last direct reason resolves", () => {
    const row = resolve(
      deliver(null, mention),
      "bob",
      [{ kind: "mentioned", userId: "bob" }],
      at("2026-11-13T12:00:00Z")
    )
    expect(row).toMatchObject({ state: "done", direct: [] })
  })

  it("brings a done row back as unread, counting from one", () => {
    const done = resolve(
      deliver(null, mention),
      "bob",
      [{ kind: "all" }],
      at("2026-11-13T12:00:00Z")
    )
    expect(deliver(done, comment)).toMatchObject({
      state: "unread",
      unreadCount: 1
    })
  })

  it("keeps newer events when an older batch arrives late", () => {
    const newer = deliver(null, comment)
    const late = deliver(newer, mention)
    expect(late).toMatchObject({
      latest: { kind: "commented" },
      unreadCount: 2,
      direct: [{ reason: "mentioned" }]
    })
    expect(read(late, at("2026-11-13T10:30:00Z"), null)).toBe(late)
  })

  it("leaves a mention newer than the resolving write open", () => {
    expect(
      resolve(
        deliver(null, mention),
        "bob",
        [{ kind: "all" }],
        at("2026-11-13T09:00:00Z")
      )
    ).toMatchObject({ state: "unread", direct: [{ reason: "mentioned" }] })
  })

  it("remembers which agent read the row", () => {
    expect(
      read(deliver(null, comment), at("2026-11-13T12:00:00Z"), "Claude Code")
    ).toMatchObject({
      state: "read",
      unreadCount: 0,
      readByClientName: "Claude Code"
    })
  })
})
