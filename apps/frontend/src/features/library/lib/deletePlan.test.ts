import { EMPTY_LAYER, GALLERY_TYPES, resolveLibrary } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  NO_TYPE,
  replacementKey,
  replacementTypes,
  ticketsToMove
} from "./deletePlan"

const spike = GALLERY_TYPES.find((type) => type.key === "spike")!
const library = resolveLibrary(
  {
    org: EMPTY_LAYER,
    project: { ...EMPTY_LAYER, types: [spike], hiddenTypes: ["chore"] }
  },
  true
)

describe("replacementTypes", () => {
  it("offers visible types other than the deleted one and epic", () => {
    expect(replacementTypes(library, "spike").map((type) => type.key)).toEqual([
      "bug",
      "feat"
    ])
  })
})

describe("replacementKey", () => {
  it("reads no type as null and anything else as a type key", () => {
    expect(replacementKey(NO_TYPE)).toBeNull()
    expect(replacementKey("bug")).toBe("bug")
  })
})

describe("ticketsToMove", () => {
  it("adds open and archived tickets", () => {
    expect(ticketsToMove([{ total: 12 }, { total: 3 }])).toBe(15)
    expect(ticketsToMove([])).toBe(0)
  })
})
