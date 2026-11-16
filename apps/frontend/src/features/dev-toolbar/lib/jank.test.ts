import { describe, expect, it } from "vitest"

import { jankPerSecond } from "./jank"

describe("jankPerSecond", () => {
  it("splits a long frame across the seconds it spans", () => {
    const shares = jankPerSecond([{ startTime: 8_800, duration: 400 }], 10_000)
    expect(shares.slice(-2).map(({ share }) => share)).toEqual([0.2, 0.2])
  })
})
