import { OUTER_RING } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { avatarColor } from "./avatarColor"

const ids = Array.from({ length: 500 }, (_, i) => `user-${i}`)

describe("avatarColor", () => {
  it("gives the same id the same colour every time", () => {
    expect(avatarColor("4bODtSiEU6TFez4gBvtVj4NfSuYxArPc")).toBe(
      avatarColor("4bODtSiEU6TFez4gBvtVj4NfSuYxArPc")
    )
  })

  it("spreads people over every distinct tag colour", () => {
    const distinct = new Set(OUTER_RING.map((swatch) => swatch.hex))
    const used = new Set(ids.map((id) => avatarColor(id).hex))
    expect(used).toEqual(distinct)
  })

  it("always picks a chromatic swatch, never a neutral", () => {
    for (const id of ["", ...ids]) {
      expect(OUTER_RING).toContain(avatarColor(id))
      expect(avatarColor(id).C).toBeGreaterThan(0)
    }
  })
})
