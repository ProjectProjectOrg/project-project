import { describe, expect, it } from "vitest"

import { isEmptyEstimateSummary } from "./estimateMeta"

const noSizes = { XS: 0, S: 0, M: 0, L: 0, XL: 0 }

describe("isEmptyEstimateSummary", () => {
  it("is empty only with no estimates and no unestimated tickets", () => {
    const totals = {
      unit: "points",
      committed: 0,
      started: 0,
      done: 0
    } as const
    expect(isEmptyEstimateSummary({ ...totals, unestimated: 0 })).toBe(true)
    expect(isEmptyEstimateSummary({ ...totals, unestimated: 2 })).toBe(false)
    expect(
      isEmptyEstimateSummary({ ...totals, committed: 3, unestimated: 0 })
    ).toBe(false)
    expect(
      isEmptyEstimateSummary({ unit: "tshirt", sizes: noSizes, unestimated: 0 })
    ).toBe(true)
    expect(
      isEmptyEstimateSummary({
        unit: "tshirt",
        sizes: { ...noSizes, M: 1 },
        unestimated: 0
      })
    ).toBe(false)
  })
})
