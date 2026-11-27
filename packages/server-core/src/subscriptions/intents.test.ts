import { formatMentionHref, TicketId, UserId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  serializeCommentsRegion,
  type CommentBlock
} from "../comments/comments-region"
import {
  commentChanges,
  subscriptionIntents,
  type SubscriptionSource
} from "./intents"

const userId = Schema.decodeUnknownSync(UserId)

const mention = (id: string) => `[@${id}](${formatMentionHref("user", id)})`

const comment = (id: string, author: string, body: string) =>
  ({
    id,
    author: { kind: "user", userId: author },
    origin: "native",
    createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-13T10:00:00Z")),
    editedAt: null,
    body
  }) satisfies CommentBlock

const base: SubscriptionSource = {
  id: Schema.decodeUnknownSync(TicketId)("T-1"),
  createdBy: "creator",
  assignees: [],
  body: "",
  commentsRegion: ""
}

const reasons = (
  before: SubscriptionSource | null,
  after: SubscriptionSource
) =>
  subscriptionIntents(before, after).map(({ userId, reason }) => [
    userId,
    reason
  ])

describe("subscriptionIntents", () => {
  it("subscribes the creator, assignees and mentioned people of a new ticket", () => {
    expect(
      reasons(null, {
        ...base,
        assignees: [userId("ann")],
        body: `cc ${mention("bob")}`
      })
    ).toEqual([
      ["creator", "created"],
      ["ann", "assigned"],
      ["bob", "mentioned"]
    ])
  })

  it("subscribes only people newly assigned on an update, never the editor", () => {
    expect(
      reasons(
        { ...base, assignees: [userId("ann")] },
        { ...base, assignees: [userId("ann"), userId("bob")] }
      )
    ).toEqual([["bob", "assigned"]])
  })

  it("subscribes someone mentioned again in the description", () => {
    expect(
      reasons(
        { ...base, body: mention("ann") },
        { ...base, body: `${mention("ann")} and again ${mention("ann")}` }
      )
    ).toEqual([["ann", "mentioned"]])
  })

  it("subscribes a new comment's author and the people it mentions", () => {
    const earlier = comment("c1", "ann", `ping ${mention("bob")}`)
    expect(
      reasons(
        { ...base, commentsRegion: serializeCommentsRegion([earlier]) },
        {
          ...base,
          commentsRegion: serializeCommentsRegion([
            earlier,
            comment("c2", "carl", `ping ${mention("bob")} again`)
          ])
        }
      )
    ).toEqual([
      ["carl", "commented"],
      ["bob", "mentioned"]
    ])
  })

  it("subscribes people a comment edit adds a mention of, not its author", () => {
    const before = comment("c1", "ann", "hello")
    expect(
      reasons(
        { ...base, commentsRegion: serializeCommentsRegion([before]) },
        {
          ...base,
          commentsRegion: serializeCommentsRegion([
            { ...before, body: `hello ${mention("bob")}` }
          ])
        }
      )
    ).toEqual([["bob", "mentioned"]])
  })

  it("keeps the reason that overrides an unsubscribe when one person has several", () => {
    expect(reasons(null, { ...base, assignees: [userId("creator")] })).toEqual([
      ["creator", "assigned"]
    ])
  })
})

describe("commentChanges", () => {
  it("keeps a thread named after its root, even once the root is gone", () => {
    const root = comment("c_root", "ann", "Root")
    const reply = { ...comment("c_reply", "bob", "Reply"), replyTo: "c_root" }
    const edited = { ...reply, body: `Reply ${mention("carl")}` }
    const thread = (blocks: ReadonlyArray<CommentBlock>) =>
      commentChanges(
        serializeCommentsRegion([root, reply]),
        serializeCommentsRegion(blocks)
      ).map((change) => change.threadId)
    expect(thread([root, edited])).toEqual(["c_root"])
    expect(thread([edited])).toEqual(["c_root"])
    const answer = { ...comment("c_answer", "carl", "Ok"), replyTo: "c_reply" }
    expect(thread([reply, answer])).toEqual(["c_root"])
  })
})
