import {
  ActivityActor,
  TicketId,
  TicketStatus,
  UserId,
  formatMentionHref
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  serializeCommentsRegion,
  type CommentBlock
} from "../comments/comments-region"
import type { SubscriptionSource } from "../subscriptions/intents"
import { inboxNotices, stageInbox, type InboxInput } from "./events"

const ticketId = Schema.decodeUnknownSync(TicketId)
const status = Schema.decodeUnknownSync(TicketStatus)
const userId = Schema.decodeUnknownSync(UserId)

const base: InboxInput = {
  ticketId: "T-1",
  occurredAt: "2026-11-13T10:00:00.000Z",
  actor: ActivityActor.user("ann"),
  cause: null,
  changes: [],
  notices: [],
  finished: null,
  statusBefore: null,
  touched: false
}

const statusTo = (to: string): InboxInput["changes"] => [
  {
    ticketId: ticketId("T-1"),
    change: { kind: "status_changed", from: status("todo"), to: status(to) }
  }
]

const source: SubscriptionSource = {
  id: ticketId("T-1"),
  createdBy: "ann",
  assignees: [],
  body: "",
  commentsRegion: ""
}

const comment = (
  id: string,
  origin: CommentBlock["origin"],
  body: string
): CommentBlock => ({
  id,
  author: { kind: "user", userId: "carl" },
  origin,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-13T10:00:00Z")),
  editedAt: null,
  body
})

describe("stageInbox", () => {
  it("assigns the added people directly and resolves the removed ones", () => {
    const staged = stageInbox({
      ...base,
      changes: [
        {
          ticketId: ticketId("T-1"),
          change: {
            kind: "assignees_changed",
            added: [userId("bob")],
            removed: [userId("carl")]
          }
        }
      ]
    })
    expect(staged?.direct).toEqual([
      { userId: "bob", event: { kind: "assigned" } }
    ])
    expect(staged?.resolve).toEqual([{ kind: "assigned", userId: "carl" }])
    expect(staged?.subscribers).toEqual([
      { kind: "reassigned", added: ["bob"], removed: ["carl"] }
    ])
  })

  it("resolves every direct reason and unblocks only when the status is finished", () => {
    const finished = new Set(["done"])
    expect(
      stageInbox({ ...base, changes: statusTo("in_progress"), finished })
    ).toMatchObject({ resolve: [], unblockWith: null })
    expect(
      stageInbox({ ...base, changes: statusTo("done"), finished })
    ).toMatchObject({ resolve: [{ kind: "all" }], unblockWith: ["done"] })
  })

  it("unblocks only when the ticket leaves the open statuses", () => {
    const finished = new Set(["done", "released"])
    expect(
      stageInbox({
        ...base,
        changes: [
          {
            ticketId: ticketId("T-1"),
            change: {
              kind: "status_changed",
              from: status("done"),
              to: status("released")
            }
          }
        ],
        finished
      })
    ).toMatchObject({ resolve: [{ kind: "all" }], unblockWith: null })
    expect(
      stageInbox({
        ...base,
        changes: [{ ticketId: ticketId("T-1"), change: { kind: "archived" } }],
        finished,
        statusBefore: "done"
      })?.unblockWith
    ).toBeNull()
  })

  it("reads the ticket for whoever edits or removes a comment", () => {
    expect(stageInbox({ ...base, touched: true })).toMatchObject({
      readBy: true,
      subscribers: [],
      direct: []
    })
  })

  it("stays quiet for imports and cleanup, but not for git automation", () => {
    expect(
      stageInbox({
        ...base,
        actor: ActivityActor.system("import"),
        changes: statusTo("done")
      })?.notify
    ).toBe(false)
    expect(
      stageInbox({
        ...base,
        cause: "member_removed",
        changes: statusTo("done")
      })?.notify
    ).toBe(false)
    expect(
      stageInbox({
        ...base,
        changes: statusTo("done").map((entry) => ({
          ...entry,
          cause: "git_automation" as const
        }))
      })
    ).toMatchObject({ notify: true, actor: { actorKind: "system" } })
  })

  it("tells subscribers about a comment and resolves its author's mention", () => {
    expect(
      stageInbox({
        ...base,
        notices: [{ kind: "commented", authorId: "ann", commentId: "c1" }]
      })
    ).toMatchObject({
      subscribers: [{ kind: "commented", commentId: "c1" }],
      resolve: [{ kind: "mentioned", userId: "ann" }],
      readBy: true
    })
  })
})

describe("inboxNotices", () => {
  it("ignores comments imported from Jira", () => {
    const mention = `[@bob](${formatMentionHref("user", "bob")})`
    expect(
      inboxNotices(source, {
        ...source,
        commentsRegion: serializeCommentsRegion([
          comment("c1", "jira", mention),
          comment("c2", "native", mention)
        ])
      })
    ).toEqual([
      { kind: "commented", authorId: "carl", commentId: "c2" },
      { kind: "mentioned", userId: "bob", commentId: "c2" }
    ])
  })

  it("assigns the people on a new ticket", () => {
    expect(
      inboxNotices(null, { ...source, assignees: [userId("bob")] })
    ).toEqual([{ kind: "assigned", userId: "bob" }])
  })
})
