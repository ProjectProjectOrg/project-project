import { describe, expect, it } from "vitest"

import { terminalFor } from "./terminal"

describe("terminalFor", () => {
  it("keeps piped output plain, so agents read the same text as before", () => {
    expect(terminalFor({ isTTY: false }, {})).toEqual({
      fancy: false,
      color: false
    })
    expect(terminalFor({}, {})).toEqual({ fancy: false, color: false })
  })

  it("draws in a terminal, without colour under NO_COLOR or TERM=dumb", () => {
    expect(terminalFor({ isTTY: true }, {})).toEqual({
      fancy: true,
      color: true
    })
    expect(terminalFor({ isTTY: true }, { NO_COLOR: "1" })).toEqual({
      fancy: true,
      color: false
    })
    expect(terminalFor({ isTTY: true }, { NO_COLOR: "0" })).toEqual({
      fancy: true,
      color: false
    })
    expect(terminalFor({ isTTY: true }, { TERM: "dumb" })).toEqual({
      fancy: false,
      color: false
    })
  })
})
