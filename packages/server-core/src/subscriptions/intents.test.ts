import { formatMentionHref, TicketId, UserId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  serializeCommentsRegion,
  type CommentBlock
} from "../comments/comments-region"
import { subscriptionIntents, type SubscriptionSource } from "./intents"

const userId = Schema.decodeUnknownSync(UserId)

const mention = (id: string) => `[@${id}](${formatMentionHref("user", id)})`

const comment = (id: string, author: string, body: string): CommentBlock => ({
  id,
  author: { kind: "user", userId: author },
  origin: "native",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-13T10:00:00Z")),
  editedAt: null,
  body
})

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
