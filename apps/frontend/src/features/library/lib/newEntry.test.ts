import { EMPTY_LAYER, GALLERY_TYPES, resolveLibrary } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  exampleSections,
  exampleTypes,
  newSectionDraft,
  newTypeDraft,
  sectionsNeededBy,
  takenKeys
} from "./newEntry"

const spike = GALLERY_TYPES.find((type) => type.key === "spike")!
const library = resolveLibrary({ org: EMPTY_LAYER, project: EMPTY_LAYER }, true)
const withSpike = resolveLibrary(
  { org: { ...EMPTY_LAYER, types: [spike] }, project: EMPTY_LAYER },
  true
)

describe("examples", () => {
  it("offers gallery types that are not built in or already here", () => {
    const keys = exampleTypes(library).map((type) => type.key)
    expect(keys).toContain("spike")
    expect(keys).not.toContain("bug")
    expect(exampleTypes(withSpike).map((type) => type.key)).not.toContain(
      "spike"
    )
  })

  it("offers gallery sections that are not here yet", () => {
    const keys = exampleSections(library).map((section) => section.key)
    expect(keys).toContain("findings")
    expect(keys).not.toContain("context")
  })
})

describe("newTypeDraft", () => {
  it("starts an empty type with no sections", () => {
    expect(
      newTypeDraft(null, { key: "research", name: "Research", icon: null })
    ).toMatchObject({ key: "research", name: "Research", body: "", tags: [] })
  })

  it("takes the example's starting description under the chosen name", () => {
    const draft = newTypeDraft(spike, {
      key: "research",
      name: "Research",
      icon: "Bug"
    })
    expect(draft).toMatchObject({
      key: "research",
      name: "Research",
      icon: "Bug",
      body: spike.body,
      description: spike.description
    })
  })

  it("names the gallery sections the example needs that are missing", () => {
    expect(sectionsNeededBy(library, spike).map((block) => block.key)).toEqual([
      "approach",
      "open-questions",
      "findings"
    ])
  })
})

describe("newSectionDraft", () => {
  it("starts an empty section with its name as the heading", () => {
    expect(
      newSectionDraft(null, { key: "impact", name: "Impact", icon: null })
    ).toMatchObject({ content: "## Impact", sync: false })
  })
})

describe("takenKeys", () => {
  it("collects the keys of every library the new entry must not clash with", () => {
    const taken = takenKeys([library, withSpike], "type")
    expect(taken.has("bug")).toBe(true)
    expect(taken.has("spike")).toBe(true)
    expect(takenKeys([library], "section").has("context")).toBe(true)
  })
})
