import { expect, it } from "vitest"

import { ticketCommandValue, ticketItem } from "./ticketCommandTargets"

it("keeps command identities separate when projects share a ticket ID", () => {
  const alpha = { projectSlug: "alpha", id: "T-1", title: "Alpha ticket" }
  const beta = { projectSlug: "beta", id: "T-1", title: "Beta ticket" }
  expect([
    ticketItem(alpha, "Tickets").value,
    ticketItem(beta, "Tickets").value
  ]).toEqual(["open-ticket:alpha/T-1", "open-ticket:beta/T-1"])
  expect(ticketCommandValue(alpha)).toBe(ticketItem(alpha, "Tickets").value)
  expect(ticketCommandValue(beta)).toBe(ticketItem(beta, "Tickets").value)
})
