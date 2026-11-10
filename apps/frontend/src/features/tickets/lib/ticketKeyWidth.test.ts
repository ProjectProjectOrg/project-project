import { describe, expect, it } from "vitest"

import { ticketKeyWidth } from "./ticketKeyWidth"

describe("ticketKeyWidth", () => {
  it("fits the project's highest ticket key", () => {
    expect(ticketKeyWidth({ key: "PERF", nextTicketNumber: 1000 })).toBe("8ch")
    expect(ticketKeyWidth({ key: "PERF", nextTicketNumber: 1001 })).toBe("9ch")
  })
})
