import { describe, expect, it } from "vitest"

import { isNearScrollEnd } from "./scroll"

describe("isNearScrollEnd", () => {
  it("loads when the list is scrolled near its end", () => {
    expect(
      isNearScrollEnd({
        scrollTop: 300,
        scrollHeight: 600,
        clientHeight: 220
      })
    ).toBe(true)
  })

  it("waits while the end is still far away", () => {
    expect(
      isNearScrollEnd({
        scrollTop: 0,
        scrollHeight: 600,
        clientHeight: 220
      })
    ).toBe(false)
  })
})
