import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { commentMarkdown } from "./commentClipboard"

const ticketId = Schema.decodeSync(TicketId)

describe("commentMarkdown", () => {
  it("credits the author and links back to the comment above its body", () => {
    const markdown = commentMarkdown(
      {
        author: {
          kind: "jira",
          displayName: "Sam de Vries",
          accountId: "jira-1"
        },
        body: "Import note only.\n"
      },
      ticketId("T-12"),
      "https://pp.test/orgs/o/projects/p/tickets/T-12#c_1"
    )

    expect(markdown).toBe(
      "**Sam de Vries** · [T-12](https://pp.test/orgs/o/projects/p/tickets/T-12#c_1)\n\nImport note only."
    )
  })
})
