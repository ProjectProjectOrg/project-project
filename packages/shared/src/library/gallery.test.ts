import { describe, expect, it } from "vitest"

import { parseTicketBlocks, validateTicketBlocks } from "../tickets/blocks"
import { BUILTIN_BLOCKS, BUILTIN_TYPES } from "./builtins"
import { GALLERY_BLOCKS, GALLERY_TYPES } from "./gallery"
import { hintSlots } from "./hints"
import { BLOCK_ICONS } from "./icons"
import {
  EMPTY_LAYER,
  GALLERY_LAYER,
  blockLookupFor,
  expandType,
  resolveLibrary
} from "./resolve"

const galleryLookup = blockLookupFor(
  resolveLibrary({ org: GALLERY_LAYER, project: null }, false, EMPTY_LAYER)
)

const blockTypesOf = (markdown: string) =>
  parseTicketBlocks(markdown).flatMap((segment) =>
    segment.kind === "block" ? [segment.type] : []
  )

describe("gallery blocks", () => {
  it("ships 16 blocks with unique keys", () => {
    expect(GALLERY_BLOCKS).toHaveLength(16)
    expect(new Set(GALLERY_BLOCKS.map((block) => block.key)).size).toBe(16)
  })

  it("uses curated icons only", () => {
    for (const item of [...GALLERY_BLOCKS, ...GALLERY_TYPES]) {
      expect(BLOCK_ICONS).toContain(item.icon)
    }
  })

  it("ships without colours, so icons match the text", () => {
    for (const item of [...GALLERY_BLOCKS, ...GALLERY_TYPES])
      expect(item.color, item.key).toBeNull()
  })

  it("opens with the built-in sections", () => {
    expect(GALLERY_BLOCKS.slice(0, BUILTIN_BLOCKS.length)).toEqual(
      BUILTIN_BLOCKS
    )
  })

  it("syncs only the definition of done", () => {
    expect(
      GALLERY_BLOCKS.filter((block) => block.sync).map((block) => block.key)
    ).toEqual(["definition-of-done"])
  })

  it("opens every block with a heading that matches its name", () => {
    for (const block of GALLERY_BLOCKS) {
      expect(block.content.split("\n")[0]).toBe(`## ${block.name}`)
    }
  })

  it("keeps block markup out of definitions and passes validation", () => {
    for (const block of GALLERY_BLOCKS) {
      expect(block.content).not.toContain("<block")
      expect(validateTicketBlocks(block.content)).toEqual([])
    }
  })

  it("gives every copied block at least one hint", () => {
    for (const block of GALLERY_BLOCKS.filter((candidate) => !candidate.sync)) {
      expect(hintSlots(block.content).length, block.key).toBeGreaterThan(0)
    }
  })
})

describe("gallery types", () => {
  it("ships the gallery types that are not built in", () => {
    expect(GALLERY_TYPES.map((type) => type.key)).toEqual([
      "spike",
      "user-story",
      "incident",
      "release",
      "design-task",
      "docs"
    ])
    for (const type of GALLERY_TYPES)
      expect(BUILTIN_TYPES.map((builtin) => builtin.key)).not.toContain(
        type.key
      )
  })

  it("heads Spike's approach like the Approach block it adopts", () => {
    const spike = GALLERY_TYPES.find((type) => type.key === "spike")
    const approach = parseTicketBlocks(spike?.body ?? "").find(
      (segment) => segment.kind === "block" && segment.type === "approach"
    )
    expect(
      approach?.kind === "block" ? approach.content.trim().split("\n")[0] : null
    ).toBe("## Approach")
  })

  it("references gallery blocks only, in valid markup", () => {
    const keys = GALLERY_BLOCKS.map((block) => block.key)
    for (const type of GALLERY_TYPES) {
      expect(validateTicketBlocks(type.body)).toEqual([])
      for (const blockType of blockTypesOf(type.body))
        expect(keys).toContain(blockType)
    }
  })

  it.each(GALLERY_TYPES.map((type) => [type.key, type] as const))(
    "expands %s to a clean body with every block",
    (_key, type) => {
      const expanded = expandType(type, galleryLookup)

      expect(validateTicketBlocks(expanded)).toEqual([])
      expect(expanded).not.toContain("{{")
      expect(blockTypesOf(expanded)).toEqual(blockTypesOf(type.body))
    }
  )

  it("expands the incident review with its own headings", () => {
    const expanded = expandType(
      GALLERY_TYPES.find((type) => type.key === "incident") ?? {
        body: ""
      },
      galleryLookup
    )

    expect(expanded.match(/^## .+$/gm)).toEqual([
      "## Impact",
      "## Timeline",
      "## Root cause",
      "## Follow-ups"
    ])
  })
})
