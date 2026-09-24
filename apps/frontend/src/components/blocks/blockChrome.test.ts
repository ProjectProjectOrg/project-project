import { EMPTY_LAYER, resolveLibrary } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  BUILTIN_LIBRARY,
  blankBlockHeading,
  blockChrome,
  blockTooltip,
  lookupFor
} from "./blockChrome"

describe("blankBlockHeading", () => {
  it("returns the heading of a block with nothing under it", () => {
    expect(blankBlockHeading("## Context\n\n")).toBe("## Context")
  })

  it("treats empty list and task items as not filled in", () => {
    expect(blankBlockHeading("## Steps\n\n1. \n2.\n- [ ] \n")).toBe("## Steps")
  })

  it("returns an empty heading for an empty block", () => {
    expect(blankBlockHeading("\n\n")).toBe("")
  })

  it("returns null once anything is written", () => {
    expect(blankBlockHeading("## Context\n\nWhy.")).toBeNull()
    expect(blankBlockHeading("## Steps\n\n1. Sign in")).toBeNull()
    expect(blankBlockHeading("Loose text")).toBeNull()
  })
})

describe("blockChrome", () => {
  const lookup = lookupFor(BUILTIN_LIBRARY)
  const EMPTY_LIBRARY = resolveLibrary(
    { org: EMPTY_LAYER, project: null },
    false
  )

  it("uses the definition for a known block", () => {
    const chrome = blockChrome("definition-of-done", lookup)
    expect(chrome).toMatchObject({
      name: "Definition of done",
      origin: "org",
      icon: "CircleCheckBig"
    })
    expect(chrome.color).toBeNull()
    expect(blockTooltip(chrome)).toBe("Definition of done · org")
  })

  it("humanizes the key of an unknown block", () => {
    const chrome = blockChrome("release-notes", lookup)
    expect(chrome).toEqual({
      name: "Release notes",
      origin: null,
      icon: "Square",
      color: null
    })
    expect(blockTooltip(chrome)).toBe("Release notes")
  })

  it("borrows the gallery icon and name for a built-in key the library lacks", () => {
    const chrome = blockChrome("context", lookupFor(EMPTY_LIBRARY))
    expect(chrome).toEqual({
      name: "Context",
      origin: null,
      icon: lookup("context")?.icon,
      color: null
    })
    expect(chrome.icon).not.toBe("Square")
    expect(blockTooltip(chrome)).toBe("Context")
  })

  it("treats a hidden definition as unknown", () => {
    const library = {
      ...BUILTIN_LIBRARY,
      blocks: BUILTIN_LIBRARY.blocks.map((block) =>
        block.key === "context" ? { ...block, hidden: true } : block
      )
    }
    expect(blockChrome("context", lookupFor(library)).origin).toBeNull()
  })
})
