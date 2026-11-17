import { CommentId, TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { ticketFromComment } from "./ticketFromComment"

const ticketId = Schema.decodeSync(TicketId)
const commentId = Schema.decodeSync(CommentId)

const sam = {
  kind: "imported",
  source: "jira",
  displayName: "Sam de Vries",
  sourceId: "jira-1"
} as const

describe("ticketFromComment", () => {
  it("titles the ticket with the comment's first line and quotes the comment under a link back", () => {
    const draft = ticketFromComment(
      {
        id: commentId("c_1"),
        author: sam,
        body: "- Won't Do should still archive the ticket\n\nOtherwise they flood [T-3](mention:ticket/T-3)."
      },
      "web",
      ticketId("T-12")
    )

    expect(draft).toEqual({
      title: "Won't Do should still archive the ticket",
      body: "**Sam de Vries** said in [T-12](mention:comment/web/T-12/c_1):\n\n> - Won't Do should still archive the ticket\n>\n> Otherwise they flood [T-3](mention:ticket/web/T-3)."
    })
  })

  it("cuts a long first line to a title that fits", () => {
    const { title } = ticketFromComment(
      { id: commentId("c_1"), author: sam, body: "word ".repeat(40) },
      "web",
      ticketId("T-12")
    )

    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith("…")).toBe(true)
  })
})
