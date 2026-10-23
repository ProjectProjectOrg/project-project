import { describe, expect, it } from "vitest"

import { slashTriggerMatch } from "./slashMenuItems"

describe("slashTriggerMatch", () => {
  it("fires at the start of a line or after whitespace only", () => {
    expect(slashTriggerMatch("/")?.matchingString).toBe("")
    expect(slashTriggerMatch("Some text /acc")?.matchingString).toBe("acc")
    expect(slashTriggerMatch("and/or")).toBeNull()
    expect(slashTriggerMatch("/acc more")).toBeNull()
    expect(slashTriggerMatch("see /etc/hosts")).toBeNull()
  })
})
