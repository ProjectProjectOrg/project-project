import { describe, expect, it } from "vitest"

import { REAPER_INTERVAL_MS } from "./Attachments"

describe("reaper cadence", () => {
  it("sweeps hourly", () => {
    expect(REAPER_INTERVAL_MS).toBe(60 * 60 * 1000)
  })

  it("sweeps at least as often as the pending ttl", async () => {
    const { PENDING_TTL_MS } = await import("./Attachments")
    expect(REAPER_INTERVAL_MS).toBeLessThanOrEqual(PENDING_TTL_MS)
  })
})
