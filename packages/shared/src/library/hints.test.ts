import { describe, expect, it } from "vitest"

import {
  activeHintSlots,
  alignedHintSlots,
  HINT,
  hintSlots,
  outlineBlockContent,
  restoreDefinitionHints,
  stripHints
} from "./hints"

const STEPS = [
  "## Steps to reproduce",
  "",
  "1. {{Where you start}}",
  "2. {{What you do}}",
  "3. {{What you see}}",
  "",
  "{{How often: always, sometimes, only when…}}"
].join("\n")

const EXPECTED = [
  "## Expected vs actual",
  "",
  "**Expected:** {{what should happen}}",
  "",
  "**Actual:** {{what happens instead}}"
].join("\n")

describe("HINT", () => {
  it("captures a trailing hint token", () => {
    expect(HINT.exec("**Expected:** {{what should happen}}  ")?.[1]).toBe(
      "what should happen"
    )
  })

  it("ignores a hint that is not the last token", () => {
    expect(HINT.test("use {{name}} here")).toBe(false)
    expect(HINT.test("{{}}")).toBe(false)
  })
})

describe("stripHints", () => {
  it("reads CRLF lines like LF lines", () => {
    expect(stripHints(EXPECTED.replaceAll("\n", "\r\n"))).toBe(
      stripHints(EXPECTED)
    )
    expect(hintSlots("## Title {{t}}\r\n")).toEqual(
      hintSlots("## Title {{t}}\n")
    )
    expect(hintSlots("## Title {{t}}\r\n")[0]?.kind).toBe("heading")
  })
  it("removes trailing hints and the space before them", () => {
    expect(stripHints(EXPECTED)).toBe(
      "## Expected vs actual\n\n**Expected:**\n\n**Actual:**"
    )
  })

  it("keeps list and task markers as empty items", () => {
    expect(
      stripHints(
        "1. {{Where you start}}\n- {{Thing}}\n- [ ] {{Outcome}}\n* [x] {{Done}}"
      )
    ).toBe("1. \n- \n- [ ] \n* [x] ")
  })

  it("empties a line that only held a hint", () => {
    expect(stripHints(STEPS)).toBe("## Steps to reproduce\n\n1. \n2. \n3. \n\n")
  })

  it("leaves mid-line braces literal", () => {
    const markdown = "Use {{name}} in the greeting.\nKeep {{a}} but drop {{b}}"

    expect(stripHints(markdown)).toBe(
      "Use {{name}} in the greeting.\nKeep {{a}} but drop"
    )
  })

  it("leaves hints inside fences untouched", () => {
    const markdown = [
      "```md",
      "- [ ] {{Outcome}}",
      "```",
      "~~~ {{info}}",
      "{{x}}",
      "~~~",
      "after {{hint}}"
    ].join("\n")

    expect(stripHints(markdown)).toBe(
      [
        "```md",
        "- [ ] {{Outcome}}",
        "```",
        "~~~ {{info}}",
        "{{x}}",
        "~~~",
        "after"
      ].join("\n")
    )
  })

  it("is idempotent", () => {
    expect(stripHints(stripHints(STEPS))).toBe(stripHints(STEPS))
  })
})

describe("outlineBlockContent", () => {
  it("splits headings, paragraphs and lists", () => {
    expect(outlineBlockContent(stripHints(STEPS))).toEqual([
      { kind: "heading", text: "Steps to reproduce" },
      { kind: "orderedList", items: ["", "", ""] }
    ])
  })

  it("separates task lists from bullet lists", () => {
    expect(outlineBlockContent("- [ ] one\n- [x] two\n- three")).toEqual([
      { kind: "taskList", items: ["one", "two"] },
      { kind: "bulletList", items: ["three"] }
    ])
  })

  it("keeps loose lists, continuations and nested items inside their item", () => {
    const markdown = [
      "- one",
      "  more",
      "",
      "- two",
      "  - nested",
      "lazy",
      "",
      "After."
    ].join("\n")

    expect(outlineBlockContent(markdown)).toEqual([
      { kind: "bulletList", items: ["one\nmore", "two\n- nested\nlazy"] },
      { kind: "paragraph", text: "After." }
    ])
  })

  it("treats fences, quotes, tables and breaks as opaque nodes", () => {
    const markdown = [
      "```",
      "- [ ] {{x}}",
      "",
      "```",
      "> quote",
      "| a | b |",
      "",
      "---",
      "text"
    ].join("\n")

    expect(outlineBlockContent(markdown).map((node) => node.kind)).toEqual([
      "other",
      "other",
      "other",
      "paragraph"
    ])
  })
})

describe("hintSlots", () => {
  it("addresses list items by list and item index", () => {
    expect(hintSlots(STEPS)).toEqual([
      {
        path: [1, 0],
        kind: "orderedList",
        prefix: "",
        hint: "Where you start"
      },
      { path: [1, 1], kind: "orderedList", prefix: "", hint: "What you do" },
      { path: [1, 2], kind: "orderedList", prefix: "", hint: "What you see" },
      {
        path: [2],
        kind: "paragraph",
        prefix: "",
        hint: "How often: always, sometimes, only when…"
      }
    ])
  })

  it("captures the fixed prefix before the hint", () => {
    expect(hintSlots(EXPECTED)).toEqual([
      {
        path: [1],
        kind: "paragraph",
        prefix: "**Expected:**",
        hint: "what should happen"
      },
      {
        path: [2],
        kind: "paragraph",
        prefix: "**Actual:**",
        hint: "what happens instead"
      }
    ])
    expect(hintSlots("- **Where:** {{production, staging or local}}")).toEqual([
      {
        path: [0, 0],
        kind: "bulletList",
        prefix: "**Where:**",
        hint: "production, staging or local"
      }
    ])
  })

  it("finds no slots in fences or for mid-line braces", () => {
    expect(hintSlots("```\n{{x}}\n```\n\nUse {{name}} here.")).toEqual([])
  })
})

describe("activeHintSlots", () => {
  it("shows every hint on a pristine block with its empty paragraphs present", () => {
    const ticket = [
      ...outlineBlockContent(stripHints(STEPS)),
      { kind: "paragraph", text: "" }
    ] as const

    expect(activeHintSlots(STEPS, ticket)).toEqual(hintSlots(STEPS))
  })

  it("drops hints for nodes the ticket does not have", () => {
    expect(
      activeHintSlots(STEPS, outlineBlockContent(stripHints(STEPS))).map(
        (slot) => slot.path
      )
    ).toEqual([
      [1, 0],
      [1, 1],
      [1, 2]
    ])
  })

  it("hides the hint once an element has content beyond its prefix", () => {
    const ticket = outlineBlockContent(
      "## Expected vs actual\n\n**Expected:** no redirect\n\n**Actual:**"
    )

    expect(activeHintSlots(EXPECTED, ticket).map((slot) => slot.hint)).toEqual([
      "what happens instead"
    ])
  })

  it("matches a prefix given as rendered text", () => {
    const ticket = [
      { kind: "heading", text: "Expected vs actual" },
      { kind: "paragraph", text: "Expected: " },
      { kind: "paragraph", text: "Actual:" }
    ] as const

    expect(activeHintSlots(EXPECTED, ticket)).toHaveLength(2)
  })

  it("stops aligning at the first node type mismatch", () => {
    const ticket = [
      { kind: "heading", text: "Steps to reproduce" },
      { kind: "paragraph", text: "" },
      { kind: "orderedList", items: ["", "", ""] },
      { kind: "paragraph", text: "" }
    ] as const

    expect(activeHintSlots(STEPS, ticket)).toEqual([])
  })

  it("hints only the items that are still empty", () => {
    const ticket = [
      { kind: "heading", text: "Steps to reproduce" },
      { kind: "orderedList", items: ["Sign in", ""] }
    ] as const

    expect(activeHintSlots(STEPS, ticket).map((slot) => slot.hint)).toEqual([
      "What you do"
    ])
  })

  it("degrades to no hints for unrelated or empty content", () => {
    expect(activeHintSlots(STEPS, [])).toEqual([])
    expect(activeHintSlots("", outlineBlockContent(STEPS))).toEqual([])
    expect(activeHintSlots(STEPS, [{ kind: "other", text: "```" }])).toEqual([])
  })
})

describe("alignedHintSlots", () => {
  it("keeps filled slots and drops missing ones", () => {
    const ticket = [
      { kind: "heading", text: "Steps to reproduce" },
      { kind: "orderedList", items: ["Sign in", ""] }
    ] as const

    expect(alignedHintSlots(STEPS, ticket).map((slot) => slot.path)).toEqual([
      [1, 0],
      [1, 1]
    ])
  })
})

describe("restoreDefinitionHints", () => {
  const RISKS = [
    "## Risks",
    "",
    "- {{What could go wrong, how likely it is, and how we'd notice}}"
  ].join("\n")

  it("gives every line the ticket left untouched its hint back", () => {
    for (const definition of [STEPS, RISKS, EXPECTED]) {
      expect(
        restoreDefinitionHints(stripHints(definition), definition),
        definition
      ).toBe(definition)
    }
  })

  it("keeps what the ticket filled in and hints the rest", () => {
    const ticket = [
      "## Steps to reproduce",
      "",
      "1. Open settings",
      "2. ",
      "3. "
    ].join("\n")
    expect(restoreDefinitionHints(ticket, STEPS)).toBe(
      [
        "## Steps to reproduce",
        "",
        "1. Open settings",
        "2. {{What you do}}",
        "3. {{What you see}}",
        "",
        "{{How often: always, sometimes, only when…}}"
      ].join("\n")
    )
  })

  it("keeps a filled bold prefix and hints the empty one", () => {
    expect(
      restoreDefinitionHints(
        "## Expected vs actual\n\n**Expected:** it works\n\n**Actual:**",
        EXPECTED
      )
    ).toBe(
      "## Expected vs actual\n\n**Expected:** it works\n\n**Actual:** {{what happens instead}}"
    )
  })

  it("puts back a hint-only paragraph the ticket left empty", () => {
    const definition =
      "## Approach\n\n{{How you'll solve it}}\n\n- [ ] {{A step}}"
    expect(restoreDefinitionHints("## Approach\n\n- [ ] ", definition)).toBe(
      definition
    )
    expect(
      restoreDefinitionHints("## Approach", "## Approach\n\n{{Why}}")
    ).toBe("## Approach\n\n{{Why}}")
  })

  it("adds nothing where the ticket rewrote the block", () => {
    expect(restoreDefinitionHints("## Risks\n\nBattery drain.", RISKS)).toBe(
      "## Risks\n\nBattery drain."
    )
    expect(restoreDefinitionHints("## Risks\n\n- Retry storms", RISKS)).toBe(
      "## Risks\n\n- Retry storms"
    )
  })
})
