import {
  EMPTY_LAYER,
  EPIC_TYPE,
  GALLERY_TYPES,
  resolveLibrary,
  TypeKey,
  type Layer
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  BUILTIN_TYPE_DEFINITIONS,
  offersType,
  resolveType,
  typeKeyOfOption,
  typeName,
  typeOptions,
  typeOptionValue,
  visibleTypes
} from "./ticketTypes"

const spike = GALLERY_TYPES.find((type) => type.key === "spike")!
const bug = TypeKey.make("bug")
const feat = TypeKey.make("feat")

const typesWith = (project: Layer) =>
  resolveLibrary({ org: EMPTY_LAYER, project }, true).types

const projectTypes = typesWith({
  ...EMPTY_LAYER,
  types: [{ ...spike, name: "Research", color: "#968dfd" }],
  hiddenTypes: ["bug"]
})

describe("resolveType", () => {
  it("gives a built-in type the look of its definition", () => {
    expect(resolveType(projectTypes, feat)).toEqual({
      key: "feat",
      name: "Feature",
      icon: "Sparkles",
      color: "#70b445",
      known: true,
      hidden: false
    })
  })

  it("follows a renamed and restyled built-in type", () => {
    const types = typesWith({
      ...EMPTY_LAYER,
      types: [
        {
          ...BUILTIN_TYPE_DEFINITIONS.find((type) => type.key === feat)!,
          name: "Story",
          icon: "BookOpen",
          color: null
        }
      ]
    })
    expect(resolveType(types, feat)).toMatchObject({
      name: "Story",
      icon: "BookOpen",
      color: null
    })
  })

  it("gives a custom type its name, icon and colour", () => {
    expect(resolveType(projectTypes, spike.key)).toMatchObject({
      name: "Research",
      icon: spike.icon,
      color: "#968dfd",
      known: true
    })
  })

  it("keeps the look of a type the project hides", () => {
    expect(resolveType(projectTypes, bug)).toMatchObject({
      name: "Bug",
      icon: "Bug",
      color: "#f16f7e",
      known: true,
      hidden: true
    })
  })

  it("names a type that is no longer defined by its key", () => {
    expect(resolveType(projectTypes, TypeKey.make("incident"))).toEqual({
      key: "incident",
      name: "incident",
      icon: "Square",
      color: null,
      known: false,
      hidden: false
    })
  })

  it("resolves a ticket without a type to nothing", () => {
    expect(resolveType(projectTypes, null)).toBeNull()
  })
})

describe("typeName", () => {
  it("names the absence of a type", () => {
    expect(typeName(null)).toBe("No type")
    expect(typeName(resolveType(projectTypes, feat))).toBe("Feature")
  })
})

describe("typeOptions", () => {
  it("lists the visible types in library order, then no type", () => {
    expect(typeOptions(projectTypes).map((option) => option.value)).toEqual([
      "chore",
      "epic",
      "feat",
      "spike",
      "none"
    ])
  })

  it("separates no type from the types", () => {
    expect(
      typeOptions(projectTypes).flatMap((option) =>
        option.separated ? [option.value] : []
      )
    ).toEqual(["spike"])
  })

  it("leaves the epic type out where epics are not allowed", () => {
    expect(
      typeOptions(projectTypes, false).map((option) => option.value)
    ).toEqual(["chore", "feat", "spike", "none"])
    expect(visibleTypes(projectTypes, false).map((type) => type.key)).toEqual([
      "chore",
      "feat",
      "spike"
    ])
  })

  it("offers only no type when every type is hidden", () => {
    const types = typesWith({
      ...EMPTY_LAYER,
      hiddenTypes: ["feat", "bug", "chore", "epic"]
    })
    expect(typeOptions(types)).toEqual([
      { value: "none", type: null, separated: false }
    ])
  })

  it("maps no type to its option value and back", () => {
    expect(typeOptionValue(null)).toBe("none")
    expect(typeOptionValue(feat)).toBe("feat")
    expect(typeKeyOfOption("none")).toBeNull()
    expect(typeKeyOfOption(feat)).toBe("feat")
  })
})

describe("offersType", () => {
  it("offers visible types and no type", () => {
    expect(offersType(projectTypes, feat)).toBe(true)
    expect(offersType(projectTypes, null)).toBe(true)
  })

  it("does not offer hidden, undefined or disallowed epic types", () => {
    expect(offersType(projectTypes, bug)).toBe(false)
    expect(offersType(projectTypes, TypeKey.make("incident"))).toBe(false)
    expect(offersType(projectTypes, EPIC_TYPE, false)).toBe(false)
    expect(offersType(projectTypes, EPIC_TYPE)).toBe(true)
  })
})
