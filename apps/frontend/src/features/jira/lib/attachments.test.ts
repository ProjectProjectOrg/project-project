import { describe, expect, it } from "vitest"

import { attachmentSkip, attachmentSkipCounts } from "./attachments"

describe("attachmentSkip", () => {
  it("calls a zero-byte file empty rather than too large", () => {
    expect(attachmentSkip({ byteSize: 0, forcedSkipReason: "too_large" })).toBe(
      "empty"
    )
    expect(
      attachmentSkip({ byteSize: 30_000_000, forcedSkipReason: "too_large" })
    ).toBe("too_large")
    expect(attachmentSkip({ byteSize: 10, forcedSkipReason: null })).toBeNull()
  })
})

describe("attachmentSkipCounts", () => {
  it("counts files per reason, largest group first", () => {
    expect(
      attachmentSkipCounts([
        { byteSize: 30_000_000, forcedSkipReason: "too_large" },
        { byteSize: 10, forcedSkipReason: "unsupported_type" },
        { byteSize: 12, forcedSkipReason: "unsupported_type" },
        { byteSize: 0, forcedSkipReason: "too_large" },
        { byteSize: 5, forcedSkipReason: null }
      ])
    ).toEqual([
      { skip: "unsupported_type", count: 2 },
      { skip: "too_large", count: 1 },
      { skip: "empty", count: 1 }
    ])
  })
})
