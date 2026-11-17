import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { commentMarkdown } from "./commentClipboard"

const ticketId = Schema.decodeSync(TicketId)

const sam = {
  kind: "jira",
  displayName: "Sam de Vries",
  accountId: "jira-1"
} as const
const noor = {
  kind: "jira",
  displayName: "Noor Bakker",
  accountId: "jira-2"
} as const

describe("commentMarkdown", () => {
  it("credits each author above their text and links back to the first comment", () => {
    const markdown = commentMarkdown(
      [
        { author: sam, body: "Import note only.\n" },
        { author: noor, body: "Agreed." }
      ],
      ticketId("T-12"),
      "https://pp.test/orgs/o/projects/p/tickets/T-12#c_1"
    )

    expect(markdown).toBe(
      "**Sam de Vries** · [T-12](https://pp.test/orgs/o/projects/p/tickets/T-12#c_1)\n\nImport note only.\n\n**Noor Bakker**\n\nAgreed."
    )
  })
})
