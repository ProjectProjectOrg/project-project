import { describe, expect, it } from "vitest"

import { terminalText } from "./terminalText"

describe("terminalText", () => {
  it("names the pp command where a message names an MCP tool", () => {
    expect(
      terminalText(
        "oldText doesn't appear in the current description; read it again with get_ticket and copy the text exactly."
      )
    ).toBe(
      "oldText doesn't appear in the current description; read it again with `pp tickets get` and copy the text exactly."
    )
  })

  it("leaves a quoted tool name as it is", () => {
    expect(terminalText("Invalid parameters for tool 'create_sprint'")).toBe(
      "Invalid parameters for tool 'create_sprint'"
    )
  })

  it("leaves words that only contain a tool name alone", () => {
    expect(terminalText("see list_blocks_v2")).toBe("see list_blocks_v2")
  })
})
