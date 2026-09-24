import { describe, expect, it } from "vitest"

import {
  findTicketBlockEnd,
  formatBlockIssue,
  formatTicketBlock,
  parseTicketBlocks,
  serializeTicketBlocks,
  TICKET_BLOCK_OPEN,
  validateTicketBlocks
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

const DONE =
  "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Tests cover the change"

describe("synced blocks", () => {
  it("formats the sync attribute after the type", () => {
    expect(formatTicketBlock("definition-of-done", DONE, { sync: true })).toBe(
      `<block type="definition-of-done" sync>\n\n${DONE}\n\n</block>`
    )
    expect(formatTicketBlock("notes", "", { sync: true })).toBe(
      '<block type="notes" sync>\n\n</block>'
    )
  })

  it("parses sync only when the attribute is present", () => {
    const markdown = [
      formatTicketBlock("definition-of-done", DONE, { sync: true }),
      formatTicketBlock("notes", "## Notes")
    ].join("\n\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "block", type: "definition-of-done", content: DONE, sync: true },
      { kind: "block", type: "notes", content: "## Notes" }
    ])
    expect(parseTicketBlocks(markdown)[1]).not.toHaveProperty("sync")
  })

  it("round-trips sync through serialize and parse", () => {
    const segments = [
      { kind: "markdown", text: "Intro." },
      { kind: "block", type: "definition-of-done", content: DONE, sync: true },
      { kind: "block", type: "notes", content: "## Notes" }
    ] as const

    const serialized = serializeTicketBlocks(segments)

    expect(parseTicketBlocks(serialized)).toEqual(segments)
    expect(serializeTicketBlocks(parseTicketBlocks(serialized))).toBe(
      serialized
    )
  })

  it("accepts extra whitespace around the sync attribute", () => {
    expect(
      parseTicketBlocks('<block  type="notes"   sync >\n</block>')
    ).toEqual([{ kind: "block", type: "notes", content: "", sync: true }])
  })

  it("keeps the type in the first capture group", () => {
    expect(TICKET_BLOCK_OPEN.exec('<block type="notes" sync>')?.[1]).toBe(
      "notes"
    )
    expect(TICKET_BLOCK_OPEN.exec('<block type="notes">')?.[2]).toBeUndefined()
  })

  it("does not treat other attributes or a valued sync as an opener", () => {
    const openers = [
      '<block type="notes" sync="true">',
      '<block type="notes" scope="org">',
      '<block type="notes" sync scope="org">',
      '<block sync type="notes">',
      '<block type="notes"sync>',
      '<block type="notes" synced>'
    ]

    for (const opener of openers) {
      const markdown = `${opener}\ntext\n</block>`
      expect(parseTicketBlocks(markdown)).toEqual([
        { kind: "markdown", text: markdown }
      ])
    }
  })

  it("leaves a synced opener inside a fence as markdown", () => {
    const markdown = [
      "```",
      '<block type="notes" sync>',
      "</block>",
      "```"
    ].join("\n")

    expect(parseTicketBlocks(markdown)).toEqual([
      { kind: "markdown", text: markdown }
    ])
  })
})

const codesOf = (markdown: string) =>
  validateTicketBlocks(markdown).map(({ line, code }) => ({ line, code }))

describe("validateTicketBlocks", () => {
  it("reports nothing for well-formed blocks and loose markdown", () => {
    const markdown = [
      "Intro.",
      formatTicketBlock("acceptance-criteria", CRITERIA),
      formatTicketBlock("definition-of-done", DONE, { sync: true }),
      "Outro with <block> inline."
    ].join("\n\n")

    expect(validateTicketBlocks(markdown)).toEqual([])
    expect(validateTicketBlocks("")).toEqual([])
  })

  it("reports a block that is never closed", () => {
    expect(codesOf('Intro.\n\n<block type="notes">\n## Notes')).toEqual([
      { line: 3, code: "unclosed" }
    ])
  })

  it("reports a closing tag without an opener", () => {
    expect(codesOf("Intro.\n</block>")).toEqual([
      { line: 2, code: "stray_close" }
    ])
  })

  it("reports a nested opener once", () => {
    const markdown = [
      '<block type="outer">',
      '<block type="inner">',
      "inside",
      "</block>",
      "</block>"
    ].join("\n")

    expect(codesOf(markdown)).toEqual([{ line: 2, code: "nested" }])
  })

  it("reports a malformed opener", () => {
    expect(codesOf('<block type="notes" sync="true">\n</block>')).toEqual([
      { line: 1, code: "malformed_open" },
      { line: 2, code: "stray_close" }
    ])
    expect(codesOf("<block type='notes'>")).toEqual([
      { line: 1, code: "malformed_open" }
    ])
    expect(codesOf("<block>")).toEqual([{ line: 1, code: "malformed_open" }])
  })

  it("reports an invalid type", () => {
    expect(codesOf('<block type="Acceptance Criteria">')).toEqual([
      { line: 1, code: "invalid_type" }
    ])
    expect(codesOf('<block type="">')).toEqual([
      { line: 1, code: "invalid_type" }
    ])
  })

  it("ignores block markup inside fences", () => {
    const markdown = [
      "```md",
      '<block type="unclosed">',
      "</block>",
      "</block>",
      "<block type='x'>",
      "```",
      formatTicketBlock("notes", "~~~\n</block>\n<block oops>\n~~~")
    ].join("\n")

    expect(validateTicketBlocks(markdown)).toEqual([])
  })

  it("does not flag indented code, blockquote tags or inline mentions", () => {
    expect(
      validateTicketBlocks('    <block type="x">\n<blockquote>\ntext <block>')
    ).toEqual([])
  })

  it("lists issues in line order", () => {
    const markdown = [
      '<block type="a">',
      "</block>",
      "</block>",
      '<block type="b">'
    ].join("\n")

    expect(codesOf(markdown)).toEqual([
      { line: 3, code: "stray_close" },
      { line: 4, code: "unclosed" }
    ])
  })
})

describe("formatBlockIssue", () => {
  it("names the line and the offending markup", () => {
    const [issue] = validateTicketBlocks('text\n  <block type="notes">')

    expect(formatBlockIssue(issue)).toBe(
      'line 2: <block type="notes"> is never closed'
    )
  })

  it("explains every code", () => {
    const markdown = [
      "</block>",
      '<block type="Bad">',
      '<block type="a" x>',
      '<block type="outer">',
      '<block type="inner">',
      "</block>"
    ].join("\n")

    expect(validateTicketBlocks(markdown).map(formatBlockIssue)).toEqual([
      "line 1: </block> has no matching <block> opener",
      'line 2: <block type="Bad"> has an invalid type; use lowercase kebab-case such as acceptance-criteria',
      'line 3: <block type="a" x> is not a valid block opener; write <block type="key"> or <block type="key" sync>',
      'line 4: <block type="outer"> is never closed',
      'line 5: <block type="inner"> opens inside another block, and blocks cannot nest'
    ])
  })
})

describe("formatTicketBlock", () => {
  it("trims blank lines but keeps the trailing space of an empty task item", () => {
    expect(formatTicketBlock("notes", "\n\n## Notes\n\n- [ ] \n\n")).toBe(
      '<block type="notes">\n\n## Notes\n\n- [ ] \n\n</block>'
    )
  })
})
