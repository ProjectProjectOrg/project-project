import { expect, it } from "vitest"

import { railLeft } from "./blockRail"

it("floats the rail just outside the host when the margin has room", () => {
  expect(railLeft({ hostLeft: 100, textLeft: 112, clipLeft: 40 })).toBe(-36)
})

it("pulls the rail in to stay inside a clipping ancestor", () => {
  expect(railLeft({ hostLeft: 100, textLeft: 112, clipLeft: 76 })).toBe(-34)
})

it("hides the rail when it would overlap the text", () => {
  expect(railLeft({ hostLeft: 100, textLeft: 112, clipLeft: 95 })).toBeNull()
})

it("tucks the rail into a host padding that fits it", () => {
  expect(railLeft({ hostLeft: 100, textLeft: 130, clipLeft: 99 })).toBe(-29)
})
