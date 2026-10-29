import { describe, expect, it } from "@effect/vitest"
import { MCP_INSTRUCTIONS, Tools } from "@pp/shared"

import { guideText } from "./guide"

describe("pp guide", () => {
  it("names pp commands where the MCP instructions name tools", () => {
    expect(MCP_INSTRUCTIONS).toContain("`get_ticket`")
    expect(guideText).toContain("`pp tickets get`")
    for (const name of Object.keys(Tools.tools)) {
      expect(guideText).not.toContain(`\`${name}\``)
    }
    expect(guideText).not.toContain("an `pp")
  })
})
