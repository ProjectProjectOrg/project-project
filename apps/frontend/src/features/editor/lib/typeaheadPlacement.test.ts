import { describe, expect, it } from "vitest"

import { placeTypeahead } from "./typeaheadPlacement"

const viewport = { top: 0, left: 0, width: 1000, height: 800 }
const base = {
  anchorTop: 100,
  anchorLeft: 200,
  lineHeight: 20,
  menuWidth: 300,
  menuHeight: 250,
  viewport
}

describe("placeTypeahead", () => {
  it("sits under the trigger when it fits", () => {
    expect(placeTypeahead(base)).toEqual({ top: 100, left: 200 })
  })

  it("flips above the line when it would overflow the bottom", () => {
    expect(placeTypeahead({ ...base, anchorTop: 700 })).toEqual({
      top: 700 - 20 - 250 - 6,
      left: 200
    })
  })

  it("stays below when there is no room above either", () => {
    expect(
      placeTypeahead({ ...base, anchorTop: 200, menuHeight: 700 }).top
    ).toBe(200)
  })

  it("keeps the menu inside the right edge", () => {
    expect(placeTypeahead({ ...base, anchorLeft: 900 }).left).toBe(692)
  })
})
