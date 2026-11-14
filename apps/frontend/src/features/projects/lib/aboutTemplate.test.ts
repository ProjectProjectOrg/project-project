import { describe, expect, it } from "vitest"

import { isBlankAbout } from "./aboutTemplate"

describe("isBlankAbout", () => {
  it.each([
    ["", true],
    ["# Web app\n", true],
    ["# Web app\n\nShips the dashboard.", false],
    ["# Old name\n", false]
  ])("reads %j as blank: %s", (body, blank) => {
    expect(isBlankAbout(body, "Web app")).toBe(blank)
  })
})
