import { TicketId } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  settledCursor,
  shownTicket,
  stepCursor,
  stepTarget,
  urlCommitDelay,
  warmWindow
} from "./ticketStepping"

const id = Schema.decodeSync(TicketId)
const [t1, t2, t3, t4] = [id("T-1"), id("T-2"), id("T-3"), id("T-4")]
const tickets = [t1, t2, t3].map((ticket) => ({ id: ticket, title: ticket }))

describe("shownTicket", () => {
  it("shows the cursor while the URL is one the steps passed through", () => {
    let cursor = stepCursor(null, t1, t2)
    cursor = stepCursor(cursor, t1, t3)
    expect(shownTicket(cursor, t1)).toBe(t3)
    expect(shownTicket(cursor, t2)).toBe(t3)
    expect(shownTicket(cursor, t3)).toBe(t3)
  })

  it("follows the URL once something else navigates", () => {
    const cursor = stepCursor(null, t1, t2)
    expect(shownTicket(cursor, t4)).toBe(t4)
  })

  it("lets a link back to a passed ticket win once the URL has caught up", () => {
    const cursor = settledCursor(stepCursor(null, t1, t2), t2)
    expect(shownTicket(cursor, t1)).toBe(t1)
  })
})

describe("stepTarget", () => {
  it("steps to the neighbour and stops at the ends", () => {
    expect(stepTarget(tickets, t2, 1)?.id).toBe(t3)
    expect(stepTarget(tickets, t2, -1)?.id).toBe(t1)
    expect(stepTarget(tickets, t3, 1)).toBeNull()
    expect(stepTarget(tickets, t4, 1)).toBeNull()
  })
})

describe("urlCommitDelay", () => {
  it("commits taps immediately and spaces held steps", () => {
    expect(urlCommitDelay([1000], 1050, false)).toBe(0)
    expect(urlCommitDelay([1000], 1050, true)).toBe(260)
  })

  it("waits for the browser's history budget once it is spent", () => {
    const sent = Array.from({ length: 90 }, (_, i) => i * 100)
    expect(urlCommitDelay(sent, 9000, false)).toBe(21_000)
  })
})

describe("warmWindow", () => {
  const long = Array.from({ length: 30 }, (_, i) => {
    const ticket = id(`T-${i + 1}`)
    return { id: ticket, title: ticket }
  })

  it("reaches further in the direction of travel", () => {
    const forward = warmWindow(long, id("T-15"), 1)
    expect(forward[0]).toBe("T-12")
    expect(forward.at(-1)).toBe("T-25")
    const back = warmWindow(long, id("T-15"), -1)
    expect(back[0]).toBe("T-5")
    expect(back.at(-1)).toBe("T-18")
  })
})
