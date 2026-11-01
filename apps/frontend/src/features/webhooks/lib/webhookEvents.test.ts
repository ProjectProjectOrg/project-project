import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { canRetry, filledHeaders, toggleEvent } from "./webhookEvents"

const delivery = (
  state: "pending" | "delivered" | "failed" | "expired",
  hoursAgo: number
) => ({
  id: "d",
  event: "ping",
  kind: "test" as const,
  state,
  attempts: 1,
  lastAttemptAt: null,
  lastStatusCode: null,
  lastOutcome: null,
  responseExcerpt: null,
  createdAt: DateTime.toDate(
    DateTime.makeUnsafe(Date.UTC(2026, 10, 1, 12) - hoursAgo * 3_600_000)
  ),
  finishedAt: null
})
const now = DateTime.toDate(DateTime.makeUnsafe(Date.UTC(2026, 10, 1, 12)))

describe("toggleEvent", () => {
  it("adds and removes an event once", () => {
    expect(toggleEvent(["ticket_created"], "ticket_reopened", true)).toEqual([
      "ticket_created",
      "ticket_reopened"
    ])
    expect(toggleEvent(["ticket_created"], "ticket_created", true)).toEqual([
      "ticket_created"
    ])
    expect(toggleEvent(["ticket_created"], "ticket_created", false)).toEqual([])
  })
})

describe("filledHeaders", () => {
  it("drops empty rows and trims names", () => {
    expect(
      filledHeaders([
        { name: " Authorization ", value: "Bearer x" },
        { name: "", value: "" }
      ])
    ).toEqual([{ name: "Authorization", value: "Bearer x" }])
  })
})

describe("canRetry", () => {
  it("allows undelivered deliveries younger than a day", () => {
    expect(canRetry(delivery("failed", 2), now)).toBe(true)
    expect(canRetry(delivery("pending", 2), now)).toBe(true)
    expect(canRetry(delivery("expired", 23), now)).toBe(true)
    expect(canRetry(delivery("expired", 25), now)).toBe(false)
    expect(canRetry(delivery("delivered", 1), now)).toBe(false)
    expect(
      canRetry({ ...delivery("failed", 1), lastOutcome: "body_too_large" }, now)
    ).toBe(false)
  })
})
