import { describe, expect, it } from "vitest"

import { validateTicketBlocks } from "../ticketBlocks"
import { BUILTIN_BLOCKS } from "./gallery"
import { hintSlots } from "./hints"
import { BLOCK_ICONS } from "./icons"

describe("built-in blocks", () => {
  it("ships 16 blocks with unique keys", () => {
    expect(BUILTIN_BLOCKS).toHaveLength(16)
    expect(new Set(BUILTIN_BLOCKS.map((block) => block.key)).size).toBe(16)
  })

  it("uses curated icons only", () => {
    for (const item of BUILTIN_BLOCKS) {
      expect(BLOCK_ICONS).toContain(item.icon)
    }
  })

  it("ships without colours, so icons match the text", () => {
    for (const item of BUILTIN_BLOCKS) expect(item.color, item.key).toBeNull()
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
