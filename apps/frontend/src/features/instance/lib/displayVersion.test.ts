import { describe, expect, it } from "vitest"

import { displayVersion } from "./displayVersion"

describe("displayVersion", () => {
  it("shortens a commit build to seven characters", () => {
    expect(displayVersion("sha-9687fa7bc3e1d2f4a5b6c7d8e9f0a1b2c3d4e5f6")).toBe(
      "sha-9687fa7"
    )
  })

  it("keeps release tags and dev builds as they are", () => {
    expect(displayVersion("v2026.10.30-nightly.5")).toBe(
      "v2026.10.30-nightly.5"
    )
    expect(displayVersion("dev")).toBe("dev")
  })
})
