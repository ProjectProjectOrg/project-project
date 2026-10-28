import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { summarizeEstimates, type EstimatedTicket } from "./estimates"
import type { Estimate } from "./schemas/Estimate"
import { StatusSlug } from "./schemas/Status"

const s = Schema.decodeUnknownSync(StatusSlug)
const FINISHED: ReadonlySet<string> = new Set(["done"])

const ticket = (
  status: string,
  estimate: Estimate | null
): EstimatedTicket => ({
  status: s(status),
  estimate
})

describe("summarizeEstimates", () => {
  it("sums points into committed and done, counting other units as unestimated", () => {
    const tickets = [
      ticket("todo", { unit: "points", value: 5 }),
      ticket("done", { unit: "points", value: 3 }),
      ticket("in_progress", null),
      ticket("done", { unit: "tshirt", value: "M" })
    ]
    expect(summarizeEstimates(tickets, "points", FINISHED)).toEqual({
      unit: "points",
      committed: 8,
      done: 3,
      unestimated: 2
    })
  })

  it("sums time in minutes", () => {
    const tickets = [
      ticket("done", { unit: "time", minutes: 90 }),
      ticket("todo", { unit: "time", minutes: 30 })
    ]
    expect(summarizeEstimates(tickets, "time", FINISHED)).toEqual({
      unit: "time",
      committed: 120,
      done: 90,
      unestimated: 0
    })
  })

  it("counts t-shirt sizes instead of summing them", () => {
    const tickets = [
      ticket("todo", { unit: "tshirt", value: "M" }),
      ticket("done", { unit: "tshirt", value: "M" }),
      ticket("todo", { unit: "tshirt", value: "XL" }),
      ticket("todo", { unit: "points", value: 5 })
    ]
    expect(summarizeEstimates(tickets, "tshirt", FINISHED)).toEqual({
      unit: "tshirt",
      sizes: { XS: 0, S: 0, M: 2, L: 0, XL: 1 },
      unestimated: 1
    })
  })
})
