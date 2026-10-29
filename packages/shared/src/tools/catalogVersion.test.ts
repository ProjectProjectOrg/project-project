import { describe, expect, it } from "vitest"

import { catalogVersion } from "./catalogVersion"

describe("catalogVersion", () => {
  it("is a short hex fingerprint of the tool catalog", () => {
    expect(catalogVersion).toMatch(/^[0-9a-f]{8}$/)
  })
})
