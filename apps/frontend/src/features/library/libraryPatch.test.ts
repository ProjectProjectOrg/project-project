import {
  BUILTIN_BLOCKS,
  EMPTY_LAYER,
  resolveLibrary,
  type Layer
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  applyBlockCreate,
  applyBlockHide,
  applyBlockRemove,
  applyBlockUpdate
} from "./libraryPatch"

const contextBlock = BUILTIN_BLOCKS.find((block) => block.key === "context")!

const orgWithContext: Layer = { ...EMPTY_LAYER, blocks: [contextBlock] }

const libraryWith = (project: Layer | null, org: Layer = EMPTY_LAYER) =>
  resolveLibrary({ org, project }, true)

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
})
