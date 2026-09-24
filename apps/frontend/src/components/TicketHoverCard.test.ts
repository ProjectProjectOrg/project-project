import { formatTicketBlock } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { previewOverflows } from "./TicketHoverCard"

describe("previewOverflows", () => {
  it("ignores block tags and their delimiter lines", () => {
    const body = formatTicketBlock("notes", "## Notes\n\nOne line of text.")
    expect(body.split("\n").length).toBeGreaterThan(6)
    expect(previewOverflows(body)).toBe(false)
  })

  it("still flags long content inside a block", () => {
    const content = Array.from({ length: 8 }, (_, i) => `- item ${i}`).join(
      "\n"
    )
    expect(previewOverflows(formatTicketBlock("notes", content))).toBe(true)
  })
})
