import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { ticketFromComment } from "./ticketFromComment"

const ticketId = Schema.decodeSync(TicketId)

const sam = {
  kind: "jira",
  displayName: "Sam de Vries",
  accountId: "jira-1"
} as const

describe("ticketFromComment", () => {
  it("titles the ticket with the comment's first line and quotes the comment under a link back", () => {
    const draft = ticketFromComment(
      {
        author: sam,
        body: "- Won't Do should still archive the ticket\n\nOtherwise they flood the backlog."
      },
      ticketId("T-12"),
      "https://pp.test/t/T-12#c_1"
    )

    expect(draft).toEqual({
      title: "Won't Do should still archive the ticket",
      body: "**Sam de Vries** said in [a comment on T-12](https://pp.test/t/T-12#c_1):\n\n> - Won't Do should still archive the ticket\n>\n> Otherwise they flood the backlog."
    })
  })

  it("cuts a long first line to a title that fits", () => {
    const { title } = ticketFromComment(
      { author: sam, body: "word ".repeat(40) },
      ticketId("T-12"),
      "https://pp.test/t/T-12#c_1"
    )

    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith("…")).toBe(true)
  })
})
