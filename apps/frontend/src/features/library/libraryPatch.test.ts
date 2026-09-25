import {
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATES,
  EMPTY_LAYER,
  resolveLibrary,
  type Layer,
  type PartialTemplateDefaults
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  applyBlockCreate,
  applyBlockHide,
  applyBlockRemove,
  applyBlockUpdate,
  applyTemplateDefaults,
  applyTemplateRemove
} from "./libraryPatch"

const contextBlock = BUILTIN_BLOCKS.find((block) => block.key === "context")!
const bugReport = BUILTIN_TEMPLATES.find((t) => t.key === "bug-report")!
const chore = BUILTIN_TEMPLATES.find((t) => t.key === "chore")!

const orgWithContext: Layer = { ...EMPTY_LAYER, blocks: [contextBlock] }

const libraryWith = (
  project: Layer | null,
  org: Layer = EMPTY_LAYER,
  defaults: Readonly<{
    org: PartialTemplateDefaults
    project: PartialTemplateDefaults | null
  }> = { org: {}, project: project === null ? null : {} }
) => resolveLibrary({ org, project }, defaults, true)

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

  it("removing an adopted template returns it to the gallery", () => {
    const library = libraryWith(null, {
      ...EMPTY_LAYER,
      templates: [bugReport]
    })
    const removed = applyTemplateRemove(library, "bug-report", "org")
    expect(removed.templates).toEqual([])
  })

  it("merges project overrides over inherited org defaults", () => {
    const org: Layer = { ...EMPTY_LAYER, templates: [bugReport, chore] }
    const library = libraryWith(EMPTY_LAYER, org, {
      org: { bug: bugReport.key },
      project: { chore: chore.key }
    })
    const overridden = applyTemplateDefaults(library, {
      defaults: { bug: chore.key }
    })
    expect(overridden.defaults).toMatchObject({ bug: "chore", chore: "chore" })
    expect(overridden.ownDefaults).toEqual({ bug: "chore", chore: "chore" })

    const reset = applyTemplateDefaults(overridden, {
      defaults: {},
      reset: ["bug", "chore"]
    })
    expect(reset.defaults).toEqual(library.inheritedDefaults)
    expect(reset.ownDefaults).toEqual({})
  })
})
