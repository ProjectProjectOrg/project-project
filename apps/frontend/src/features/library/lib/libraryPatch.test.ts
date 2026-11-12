import {
  GALLERY_BLOCKS,
  GALLERY_TYPES,
  EMPTY_LAYER,
  resolveLibrary,
  type Layer
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  applyBlockCreate,
  applyBlockHide,
  applyBlockRemove,
  applyBlockUpdate,
  applyTypeHide,
  applyTypeRemove
} from "./libraryPatch"

const contextBlock = GALLERY_BLOCKS.find((block) => block.key === "context")!
const spike = GALLERY_TYPES.find((type) => type.key === "spike")!

const orgWithContext: Layer = { ...EMPTY_LAYER, blocks: [contextBlock] }

const libraryWith = (project: Layer | null, org: Layer = EMPTY_LAYER) =>
  resolveLibrary({ org, project }, true, EMPTY_LAYER)

const blockIn = (library: ReturnType<typeof libraryWith>, key: string) =>
  library.blocks.find((block) => block.key === key)

describe("libraryPatch", () => {
  it("adopting from the gallery matches the resolved result", () => {
    const predicted = applyBlockCreate(libraryWith(null), contextBlock, "org")
    expect(predicted.blocks).toEqual(libraryWith(null, orgWithContext).blocks)
  })

  it("customizing an org entry in a project shadows it", () => {
    const draft = { ...contextBlock, name: "Why" }
    const predicted = applyBlockCreate(
      libraryWith(EMPTY_LAYER, orgWithContext),
      draft,
      "project"
    )
    const resolved = libraryWith(
      { ...EMPTY_LAYER, blocks: [draft] },
      orgWithContext
    )
    expect(predicted.blocks).toEqual(resolved.blocks)
  })

  it("stacks edits on top of a pending create", () => {
    const created = applyBlockCreate(libraryWith(null), contextBlock, "org")
    const renamed = applyBlockUpdate(created, "context", {
      name: "Background",
      sync: true
    })
    expect(blockIn(renamed, "context")).toMatchObject({
      name: "Background",
      sync: true,
      origin: "org",
      shadows: null
    })
  })

  it("ignores undefined fields in a patch", () => {
    const patched = applyBlockUpdate(
      libraryWith(null, orgWithContext),
      "context",
      { name: undefined, description: "Changed" }
    )
    expect(blockIn(patched, "context")).toMatchObject({
      name: contextBlock.name,
      description: "Changed"
    })
  })

  it("removing an org entry under a project override keeps the project row", () => {
    const org = { ...EMPTY_LAYER, blocks: [{ ...contextBlock, name: "Org" }] }
    const project = {
      ...EMPTY_LAYER,
      blocks: [{ ...contextBlock, name: "Project" }]
    }
    const removed = applyBlockRemove(
      libraryWith(project, org),
      "context",
      "org"
    )
    expect(removed.blocks).toEqual(libraryWith(project, EMPTY_LAYER).blocks)
  })

  it("drops a project override of an org definition until the refetch", () => {
    const project = {
      ...EMPTY_LAYER,
      blocks: [{ ...contextBlock, name: "Project" }]
    }
    const removed = applyBlockRemove(
      libraryWith(project, orgWithContext),
      "context",
      "project"
    )
    expect(blockIn(removed, "context")).toBe(undefined)
  })

  it("hiding and unhiding an org entry match the resolved results", () => {
    const shown = libraryWith(EMPTY_LAYER, orgWithContext)
    const hidden = applyBlockHide(shown, "context")
    const resolvedHidden = libraryWith(
      { ...EMPTY_LAYER, hiddenBlocks: ["context"] },
      orgWithContext
    )
    expect(hidden.blocks).toEqual(resolvedHidden.blocks)
    const unhidden = applyBlockRemove(resolvedHidden, "context", "project")
    expect(unhidden.blocks).toEqual(shown.blocks)
  })

  it("removing an adopted type returns it to the gallery", () => {
    const library = libraryWith(null, { ...EMPTY_LAYER, types: [spike] })
    const removed = applyTypeRemove(library, "spike", "org")
    expect(removed.types).toEqual([])
  })

  it("hiding a built-in in a project matches the resolved result", () => {
    const shown = resolveLibrary(
      { org: EMPTY_LAYER, project: EMPTY_LAYER },
      true
    )
    const resolvedHidden = resolveLibrary(
      {
        org: EMPTY_LAYER,
        project: {
          ...EMPTY_LAYER,
          hiddenTypes: ["bug"],
          hiddenBlocks: ["context"]
        }
      },
      true
    )
    const hidden = applyBlockHide(applyTypeHide(shown, "bug"), "context")
    expect(hidden.types).toEqual(resolvedHidden.types)
    expect(hidden.blocks).toEqual(resolvedHidden.blocks)
  })
})
