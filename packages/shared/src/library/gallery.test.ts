import { describe, expect, it } from "vitest"

import { parseTicketBlocks, validateTicketBlocks } from "../ticketBlocks"
import {
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATE_DEFAULTS,
  BUILTIN_TEMPLATES
} from "./gallery"
import { hintSlots } from "./hints"
import { BLOCK_ICONS } from "./icons"
import {
  GALLERY_LAYER,
  blockLookupFor,
  expandTemplate,
  resolveLibrary
} from "./library"

const builtinLookup = blockLookupFor(
  resolveLibrary(
    { org: GALLERY_LAYER, project: null },
    { org: {}, project: null },
    false
  )
)

const blockTypesOf = (markdown: string) =>
  parseTicketBlocks(markdown).flatMap((segment) =>
    segment.kind === "block" ? [segment.type] : []
  )

describe("built-in blocks", () => {
  it("ships 16 blocks with unique keys", () => {
    expect(BUILTIN_BLOCKS).toHaveLength(16)
    expect(new Set(BUILTIN_BLOCKS.map((block) => block.key)).size).toBe(16)
  })

  it("uses curated icons only", () => {
    for (const item of [...BUILTIN_BLOCKS, ...BUILTIN_TEMPLATES]) {
      expect(BLOCK_ICONS).toContain(item.icon)
    }
  })

  it("ships without colours, so icons match the text", () => {
    for (const item of [...BUILTIN_BLOCKS, ...BUILTIN_TEMPLATES])
      expect(item.color, item.key).toBeNull()
  })

  it("syncs only the definition of done", () => {
    expect(
      BUILTIN_BLOCKS.filter((block) => block.sync).map((block) => block.key)
    ).toEqual(["definition-of-done"])
  })

  it("opens every block with a heading that matches its name", () => {
    for (const block of BUILTIN_BLOCKS) {
      expect(block.content.split("\n")[0]).toBe(`## ${block.name}`)
    }
  })

  it("keeps block markup out of definitions and passes validation", () => {
    for (const block of BUILTIN_BLOCKS) {
      expect(block.content).not.toContain("<block")
      expect(validateTicketBlocks(block.content)).toEqual([])
    }
  })

  it("heads every block with its name", () => {
    for (const block of BUILTIN_BLOCKS) {
      expect(block.content.split("\n")[0], block.key).toBe(`## ${block.name}`)
    }
  })

  it("gives every copied block at least one hint", () => {
    for (const block of BUILTIN_BLOCKS.filter((candidate) => !candidate.sync)) {
      expect(hintSlots(block.content).length, block.key).toBeGreaterThan(0)
    }
  })
})

describe("built-in templates", () => {
  it("ships 9 gallery templates", () => {
    expect(BUILTIN_TEMPLATES.map((template) => template.key)).toEqual([
      "bug-report",
      "feature",
      "chore",
      "spike",
      "user-story",
      "incident",
      "release",
      "design-task",
      "docs"
    ])
  })

  it("suggests a template per type, with other as blank", () => {
    expect(BUILTIN_TEMPLATE_DEFAULTS).toEqual({
      feat: "feature",
      bug: "bug-report",
      chore: "chore",
      other: null
    })
  })

  it("heads Spike's approach like the Approach block it adopts", () => {
    const spike = BUILTIN_TEMPLATES.find((template) => template.key === "spike")
    const approach = parseTicketBlocks(spike?.body ?? "").find(
      (segment) => segment.kind === "block" && segment.type === "approach"
    )
    expect(
      approach?.kind === "block" ? approach.content.trim().split("\n")[0] : null
    ).toBe("## Approach")
  })

  it("references built-in blocks only, in valid markup", () => {
    const keys = BUILTIN_BLOCKS.map((block) => block.key)
    for (const template of BUILTIN_TEMPLATES) {
      expect(validateTicketBlocks(template.body)).toEqual([])
      for (const type of blockTypesOf(template.body))
        expect(keys).toContain(type)
    }
  })

  it.each(
    BUILTIN_TEMPLATES.map((template) => [template.key, template] as const)
  )("expands %s to a clean body with every block", (_key, template) => {
    const expanded = expandTemplate(template, builtinLookup)

    expect(validateTicketBlocks(expanded)).toEqual([])
    expect(expanded).not.toContain("{{")
    expect(blockTypesOf(expanded)).toEqual(blockTypesOf(template.body))
  })

  it("expands the incident review with its own headings", () => {
    const expanded = expandTemplate(
      BUILTIN_TEMPLATES.find((template) => template.key === "incident") ?? {
        body: ""
      },
      builtinLookup
    )

    expect(expanded.match(/^## .+$/gm)).toEqual([
      "## Impact",
      "## Timeline",
      "## Root cause",
      "## Follow-ups"
    ])
  })
})
