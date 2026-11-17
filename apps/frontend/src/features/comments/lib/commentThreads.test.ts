import { CommentId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { commentThreads } from "./commentThreads"

const commentId = Schema.decodeSync(CommentId)

const row = (id: string, replyTo: string | null = null) => ({
  comment: {
    id: commentId(id),
    replyTo: replyTo === null ? null : commentId(replyTo)
  }
})

describe("commentThreads", () => {
  it("puts replies under their thread and keeps replies to a deleted comment as threads of their own", () => {
    const threads = commentThreads([
      row("c_a"),
      row("c_b"),
      row("c_a1", "c_a"),
      row("c_orphan", "c_deleted"),
      row("c_a2", "c_a")
    ])

    expect(
      threads.map(({ root, replies }) => [
        root.comment.id,
        replies.map((reply) => reply.comment.id)
      ])
    ).toEqual([
      ["c_a", ["c_a1", "c_a2"]],
      ["c_b", []],
      ["c_orphan", []]
    ])
  })
})
