import {
  EMPTY_LAYER,
  formatTicketBlock,
  resolveLibrary,
  TypeKey,
  type Library,
  type TypeDefinition
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import { lookupFor } from "@/features/editor/lib/blockChrome"

import { startingType, startingTypes, typeStart } from "./creatorType"

const BUILTIN = resolveLibrary({ org: EMPTY_LAYER, project: null }, false)
const builtin = (key: string): TypeDefinition => {
  const found = BUILTIN.types.find((type) => type.key === key)
  if (found === undefined) throw new Error(`no ${key}`)
  return found
}
const spike: TypeDefinition = {
  ...builtin("chore"),
  key: TypeKey.make("spike"),
  name: "Spike",
  body: formatTicketBlock("context", "")
}
const library = (...types: ReadonlyArray<TypeDefinition>): Library => ({
  ...BUILTIN,
  types: [...BUILTIN.types, ...types]
})

describe("startingType", () => {
  it("starts on the remembered type when the project still offers it", () => {
    expect(startingType(library(spike), spike.key, true)).toBe("spike")
  })

  it("trusts the remembered type until the library has loaded", () => {
    expect(startingType(null, spike.key, true)).toBe("spike")
  })

  it("starts on no type when the remembered type is hidden or gone", () => {
    expect(
      startingType(library({ ...spike, hidden: true }), spike.key, true)
    ).toBeNull()
    expect(startingType(BUILTIN, spike.key, true)).toBeNull()
  })

  it("never starts a sub-ticket or sprint ticket as an epic", () => {
    const epic = TypeKey.make("epic")
    expect(startingType(BUILTIN, epic, false)).toBeNull()
    expect(startingType(null, epic, false)).toBeNull()
    expect(startingType(BUILTIN, epic, true)).toBe("epic")
  })
})

describe("typeStart", () => {
  const lookup = lookupFor(BUILTIN)

  it("names a type's sections in order", () => {
    expect(typeStart(builtin("bug"), lookup)).toEqual({
      kind: "sections",
      names: [
        "Expected vs actual",
        "Steps to reproduce",
        "Environment",
        "Definition of done"
      ]
    })
  })

  it("skips a section the library no longer has", () => {
    const type = {
      ...spike,
      body: [
        formatTicketBlock("gone", ""),
        formatTicketBlock("context", "")
      ].join("\n\n")
    }
    expect(typeStart(type, lookup)).toEqual({
      kind: "sections",
      names: ["Context"]
    })
  })

  it("says the description starts empty without a type or sections", () => {
    expect(typeStart(null, lookup)).toEqual({ kind: "empty" })
    expect(typeStart({ ...spike, body: "" }, lookup)).toEqual({
      kind: "empty"
    })
    expect(typeStart({ ...spike, body: "Notes" }, lookup)).toEqual({
      kind: "text"
    })
  })
})

describe("startingTypes", () => {
  it("leads with the ticket's own type and leaves out epics", () => {
    expect(
      startingTypes(library(spike).types, TypeKey.make("chore")).map(
        (type) => type.key
      )
    ).toEqual(["chore", "bug", "feat", "spike"])
  })

  it("offers epic only to an epic", () => {
    expect(
      startingTypes(BUILTIN.types, TypeKey.make("epic")).map((type) => type.key)
    ).toContain("epic")
  })
})
