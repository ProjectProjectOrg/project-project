import { describe, expect, it } from "vitest"

import { avatarColor } from "./avatarColor"
import { avatarInitials, orbAvatar } from "./orbAvatar"
import { PATTERN_NAMES } from "./orbPatterns"

const samples = [0.1, 0.35, 0.5, 0.72, 0.9]

const hue = (tone: string) => Number(tone.split(" ")[2])

describe("orbAvatar", () => {
  it("draws the same orb for the same user every time", () => {
    const a = orbAvatar("4bODtSiEU6TFez4gBvtVj4NfSuYxArPc")
    const b = orbAvatar("4bODtSiEU6TFez4gBvtVj4NfSuYxArPc")
    expect(a.palette).toEqual(b.palette)
    for (const u of samples)
      for (const v of samples) expect(a.field(u, v)).toBe(b.field(u, v))
  })

  it("paints the user's tag colour plus two other wheel hues", () => {
    const id = "user-42"
    const { palette } = orbAvatar(id)
    expect(palette).toHaveLength(5)
    expect(hue(palette[3])).toBe(avatarColor(id).hue)
    expect(hue(palette[4])).toBe(avatarColor(id).hue)
    expect(hue(palette[1])).toBe(hue(palette[2]))
    expect(hue(palette[1])).not.toBe(avatarColor(id).hue)
    for (const tone of palette)
      expect(tone).toMatch(/^oklch\(0\.700 0\.160 \d+ \/ 0\.\d+\)$/)
  })

  it("spreads members across every pattern", () => {
    const patterns = new Set(
      Array.from({ length: 400 }, (_, i) => orbAvatar(`member-${i}`).traits[0])
    )
    expect(patterns.size).toBe(PATTERN_NAMES.length)
  })

  it("inks the initials in the accent hue", () => {
    const { palette, ink } = orbAvatar("user-42")
    const accent = palette[1].split(" ")[2]
    expect(ink.light).toBe(`oklch(0.300 0.100 ${accent})`)
    expect(ink.dark).toBe(`oklch(0.970 0.025 ${accent})`)
  })
})

describe("avatarInitials", () => {
  it("uses first and last capitalised name from 24px up", () => {
    expect(avatarInitials("Eva van Dijk", null, 24)).toBe("ED")
    expect(avatarInitials("Wouter Missler", null, 32)).toBe("WM")
  })

  it("uses one letter below 24px and for single names", () => {
    expect(avatarInitials("Wouter Missler", null, 20)).toBe("W")
    expect(avatarInitials("Cher", null, 40)).toBe("C")
  })

  it("falls back to the email when there is no name", () => {
    expect(avatarInitials(null, "sam@acme.test", 32)).toBe("S")
    expect(avatarInitials("  ", null, 32)).toBe("?")
  })
})
