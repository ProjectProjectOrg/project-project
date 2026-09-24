import { describe, expect, it } from "vitest"

import {
  findTicketBlockEnd,
  formatTicketBlock,
  parseTicketBlocks,
  serializeTicketBlocks
} from "./ticketBlocks"

const CRITERIA = "## Acceptance criteria\n- [ ] Can pick a template"

describe("parseTicketBlocks", () => {
  it("splits loose markdown and blocks in document order", () => {
    const markdown = [
      "Intro text.",
      "",
      '<block type="acceptance-criteria">',
      "",
      CRITERIA,
      "",
      "</block>",
      "",
      "Closing text."
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: "Intro text." },
      { kind: "block", type: "acceptance-criteria", content: CRITERIA },
      { kind: "markdown", text: "Closing text." }
    ])
  })

  it("accepts blocks written without blank lines around their content", () => {
    const markdown = `<block type="acceptance-criteria">\n${CRITERIA}\n</block>`

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "block", type: "acceptance-criteria", content: CRITERIA }
    ])
  })

  it("keeps two blocks of the same type as separate blocks", () => {
    const markdown = [
      formatTicketBlock("steps", "## Steps\n1. One"),
      formatTicketBlock("steps", "## Steps\n1. Two")
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "block", type: "steps", content: "## Steps\n1. One" },
      { kind: "block", type: "steps", content: "## Steps\n1. Two" }
    ])
  })

  it("parses an empty block", () => {
    expect(parseTicketBlocks('<block type="notes">\n\n</block>')).toEqual([
      { kind: "block", type: "notes", content: "" }
    ])
  })

  it("leaves a block tag inside a top-level code fence as markdown", () => {
    const markdown = [
      "```md",
      '<block type="acceptance-criteria">',
      CRITERIA,
      "</block>",
      "```"
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: markdown }
    ])
  })

  it("does not close a block on a closing tag inside a fenced example", () => {
    const content = ["## Format", "", "~~~md", "</block>", "~~~"].join("\n")
    const markdown = formatTicketBlock("notes", content)

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "block", type: "notes", content }
    ])
  })

  it("keeps an unclosed block as markdown", () => {
    const markdown = `<block type="notes">\n\n## Notes\nstill typing`

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: markdown }
    ])
  })

  it("keeps the outer tags of a nested block as markdown", () => {
    const markdown = [
      '<block type="outer">',
      '<block type="inner">',
      "inside",
      "</block>",
      "</block>"
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: '<block type="outer">' },
      { kind: "block", type: "inner", content: "inside" },
      { kind: "markdown", text: "</block>" }
    ])
  })

  it("ignores tags that are not a well-formed block opener", () => {
    const markdown = [
      "<block type='single-quoted'>",
      '<block type="Upper">',
      "text <block> inline",
      "</block>"
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: markdown }
    ])
  })

  it("returns nothing for an empty description", () => {
    expect(parseTicketBlocks("")).toEqual([])
    expect(parseTicketBlocks("\n\n")).toEqual([])
  })
})

describe("serializeTicketBlocks", () => {
  it("writes blocks with blank lines inside and between segments", () => {
    expect(
      serializeTicketBlocks([
        { kind: "markdown", text: "Intro." },
        { kind: "block", type: "acceptance-criteria", content: CRITERIA },
        { kind: "block", type: "notes", content: "" }
      ])
    ).toBe(
      [
        "Intro.",
        "",
        '<block type="acceptance-criteria">',
        "",
        CRITERIA,
        "",
        "</block>",
        "",
        '<block type="notes">',
        "",
        "</block>"
      ].join("\n")
    )
  })

  it("round-trips through parse", () => {
    const segments = [
      { kind: "markdown", text: "Intro.\n\nSecond paragraph." },
      {
        kind: "block",
        type: "steps",
        content: "## Steps\n\n```\n</block>\n```"
      },
      { kind: "markdown", text: "Outro." }
    ] as const

    expect(parseTicketBlocks(serializeTicketBlocks(segments))).toEqual(segments)
  })

  it("normalises a hand-written block to the standard form", () => {
    const markdown = `<block type="notes">\n## Notes\n</block>`

    expect(serializeTicketBlocks(parseTicketBlocks(markdown))).toBe(
      formatTicketBlock("notes", "## Notes")
    )
  })
})

describe("findTicketBlockEnd", () => {
  it("returns the index of the closing tag", () => {
    const lines = ['<block type="notes">', "", "text", "", "</block>"]
    expect(findTicketBlockEnd(lines, 0)).toBe(4)
  })

  it("returns null when another block opens first", () => {
    const lines = ['<block type="a">', '<block type="b">', "</block>"]
    expect(findTicketBlockEnd(lines, 0)).toBeNull()
  })
})

describe("HTML comments", () => {
  it("leaves a block inside a multi-line comment as markdown", () => {
    const markdown = [
      "Intro.",
      "",
      "<!--",
      '<block type="notes">',
      "hidden",
      "</block>",
      "-->",
      "",
      "Outro."
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: markdown }
    ])
  })

  it("parses blocks again once a comment closes", () => {
    const markdown = [
      "<!-- a note -->",
      '<block type="notes">',
      "shown",
      "</block>",
      "<!--",
      "</block>",
      "-->"
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: "<!-- a note -->" },
      { kind: "block", type: "notes", content: "shown" },
      { kind: "markdown", text: "<!--\n</block>\n-->" }
    ])
  })

  it("does not close a block on a closing tag inside a comment", () => {
    const lines = [
      '<block type="notes">',
      "<!--",
      "</block>",
      "-->",
      "</block>"
    ]
    expect(findTicketBlockEnd(lines, 0)).toBe(4)
  })

  it("treats an empty comment as closed on its own line", () => {
    const markdown = '<!-->\n<block type="notes">\nshown\n</block>'

    expect(parseTicketBlocks(markdown)[1]).toEqual({
      kind: "block",
      type: "notes",
      content: "shown"
    })
  })
})

describe("formatTicketBlock whitespace", () => {
  it("keeps the indentation of the first content line", () => {
    const content = "    const x = 1\n    const y = 2"

    expect(formatTicketBlock("notes", `\n\n${content}\n\n`)).toBe(
      `<block type="notes">\n\n${content}\n\n</block>`
    )
    expect(parseTicketBlocks(formatTicketBlock("notes", content))[0]).toEqual({
      kind: "block",
      type: "notes",
      content
    })
  })
})
