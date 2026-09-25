import { blockLookupFor, formatTicketBlock } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { sketchLines, templateSketch } from "./blockSketchModel"

describe("sketchLines", () => {
  it("drops the heading and maps list items to their markers", () => {
    expect(
      sketchLines("## Steps\n\n1. One\n2. Two\n\n- [ ] Check\n\nNote", 10)
    ).toEqual(["number", "number", "task", "text"])
  })

  it("wraps long paragraphs into up to three lines and caps the total", () => {
    expect(sketchLines("## Context\n\n" + "word ".repeat(40), 10)).toEqual([
      "text",
      "text",
      "text"
    ])
    expect(sketchLines("- a\n- b\n- c\n- d", 2)).toEqual(["bullet", "bullet"])
  })
})

describe("templateSketch", () => {
  const lookup = blockLookupFor(BUILTIN_LIBRARY)

  it("reads references from their definition and skips loose markdown", () => {
    const body = [
      "Intro",
      formatTicketBlock("definition-of-done", ""),
      formatTicketBlock("unknown-thing", "- one")
    ].join("\n\n")
    const blocks = templateSketch(body, lookup, 2)
    expect(blocks.map((block) => block.name)).toEqual([
      "Definition of done",
      "Unknown thing"
    ])
    expect(blocks[0].lines).toEqual(["task", "task"])
    expect(blocks[1].lines).toEqual(["bullet"])
  })
})
