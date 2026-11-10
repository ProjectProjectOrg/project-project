import { describe, expect, it } from "vitest"

import { reviewBlocked, reviewNeeds, type ReviewReadiness } from "./review"

const ready: ReviewReadiness = {
  conflictsChecked: true,
  conflictCount: 0,
  failedAttachmentIds: [],
  skippedAttachmentIds: [],
  saving: false,
  saveFailed: false
}

describe("review readiness", () => {
  it("starts once everything is checked and saved", () => {
    expect(reviewNeeds(ready)).toBeNull()
    expect(reviewBlocked(ready)).toBe(false)
  })

  it("says what is still needed", () => {
    expect(reviewNeeds({ ...ready, conflictCount: 1 })).toBe(
      "Pick a free project key and URL slug to start."
    )
    expect(reviewNeeds({ ...ready, failedAttachmentIds: ["a"] })).toBe(
      "Choose which failed files to leave out to start."
    )
    expect(
      reviewNeeds({
        ...ready,
        failedAttachmentIds: ["a"],
        skippedAttachmentIds: ["a"]
      })
    ).toBeNull()
  })

  it("waits for the conflict check and any save", () => {
    expect(reviewBlocked({ ...ready, conflictsChecked: false })).toBe(true)
    expect(reviewBlocked({ ...ready, saving: true })).toBe(true)
    expect(reviewBlocked({ ...ready, saveFailed: true })).toBe(true)
  })
})
