import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { commentMarkdown } from "./commentClipboard"

const ticketId = Schema.decodeSync(TicketId)

const sam = {
  kind: "imported",
  source: "jira",
  displayName: "Sam de Vries",
  sourceId: "jira-1"
} as const
const noor = {
  kind: "imported",
  source: "jira",
  displayName: "Noor Bakker",
  sourceId: "jira-2"
} as const

describe("commentMarkdown", () => {
  it("credits each author above their text, keeps indentation and links back to the first comment", () => {
    const markdown = commentMarkdown(
      [
        { author: sam, body: "\nImport note only.\n\n    const kept = true\n" },
        { author: noor, body: "Agreed." }
      ],
      ticketId("T-12"),
      "https://pp.test/orgs/o/projects/p/tickets/T-12#c_1"
    )

    expect(markdown).toBe(
      "**Sam de Vries** · [T-12](https://pp.test/orgs/o/projects/p/tickets/T-12#c_1)\n\nImport note only.\n\n    const kept = true\n\n**Noor Bakker**\n\nAgreed."
    )
  })
})
