import { describe, expect, it } from "vitest"

import { isoDate } from "../tickets/testing"
import { nextSyncAt, type SyncTiming } from "./syncSchedule"

const now = isoDate("2026-04-01T12:00:00Z")

const timing = (overrides: Partial<SyncTiming>): SyncTiming => ({
  now,
  load: "open_pull_requests",
  lastActivityAt: now,
  failures: 0,
  retryAt: null,
  ...overrides
})

const minutesFromNow = (date: Date) => (date.getTime() - now.getTime()) / 60_000

describe("nextSyncAt", () => {
  it("syncs recently active pull requests every minute and quiet ones every five", () => {
    expect(minutesFromNow(nextSyncAt(timing({})))).toBe(1)
    expect(
      minutesFromNow(
        nextSyncAt(timing({ lastActivityAt: isoDate("2026-04-01T11:00:00Z") }))
      )
    ).toBe(5)
  })

  it("checks branches without pull requests every half hour and settled projects hourly", () => {
    expect(minutesFromNow(nextSyncAt(timing({ load: "branches" })))).toBe(30)
    expect(minutesFromNow(nextSyncAt(timing({ load: "settled" })))).toBe(60)
  })

  it("doubles the wait after each failure up to half an hour", () => {
    expect(minutesFromNow(nextSyncAt(timing({ failures: 1 })))).toBe(1)
    expect(minutesFromNow(nextSyncAt(timing({ failures: 3 })))).toBe(4)
    expect(minutesFromNow(nextSyncAt(timing({ failures: 10 })))).toBe(30)
  })

  it("waits for GitHub's rate limit reset", () => {
    expect(
      minutesFromNow(
        nextSyncAt(
          timing({ failures: 1, retryAt: isoDate("2026-04-01T12:20:00Z") })
        )
      )
    ).toBe(20)
  })
})
