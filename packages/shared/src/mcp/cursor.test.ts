import { describe, expect, it } from "vitest"
import {
  padNumericIdSort,
  tryDecodeCursor
} from "./cursor"
import { encodeCursor } from "./Pagination"

describe("cursor helpers", () => {
  it("pads numeric ids to 10 chars", () => {
    expect(padNumericIdSort("T-1")).toBe("0000000001")
    expect(padNumericIdSort("G-42")).toBe("0000000042")
    expect(padNumericIdSort("T-1234567890")).toBe("1234567890")
  })

  it("falls back to undefined for non-numeric ids", () => {
    expect(padNumericIdSort("not-numeric")).toBe(undefined)
  })

  it("tryDecodeCursor returns payload for a valid cursor", () => {
    const c = encodeCursor({ id: "T-7", sort: "0000000007" })
    expect(tryDecodeCursor(c)).toEqual({ id: "T-7", sort: "0000000007" })
  })

  it("tryDecodeCursor returns undefined for garbage", () => {
    expect(tryDecodeCursor("not-base64-or-json")).toBe(undefined)
    expect(tryDecodeCursor(undefined)).toBe(undefined)
  })
})
