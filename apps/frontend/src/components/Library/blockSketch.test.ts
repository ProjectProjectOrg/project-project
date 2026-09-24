import { describe, expect, it } from "vitest"

import { sketchLines } from "./blockSketch"

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
