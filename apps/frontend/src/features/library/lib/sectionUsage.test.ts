import { EMPTY_LAYER, resolveLibrary } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { typesUsingSection, usageBySection } from "./sectionUsage"

const library = resolveLibrary(
  {
    org: EMPTY_LAYER,
    project: { ...EMPTY_LAYER, hiddenTypes: ["chore"] }
  },
  true
)

describe("typesUsingSection", () => {
  it("lists the visible types whose starting description has the section", () => {
    expect(
      typesUsingSection(library, "context").map((type) => type.key)
    ).toEqual(["epic", "feat"])
    expect(
      typesUsingSection(library, "definition-of-done").map((type) => type.key)
    ).toEqual(["bug", "feat"])
  })

  it("returns nothing for a section no type starts with", () => {
    expect(typesUsingSection(library, "unused")).toEqual([])
    expect(usageBySection(library).has("unused")).toBe(false)
  })
})
