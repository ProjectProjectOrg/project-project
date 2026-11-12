import {
  BUILTIN_BLOCKS,
  BUILTIN_TYPES,
  EMPTY_LAYER,
  GALLERY_TYPES,
  resolveLibrary
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  bodyOfRows,
  contentSummary,
  moveRow,
  sectionsToAdd,
  startingRows,
  withoutRow,
  withSection
} from "./startingSections"

const bug = BUILTIN_TYPES.find((type) => type.key === "bug")!
const spike = GALLERY_TYPES.find((type) => type.key === "spike")!

const keys = (list: ReturnType<typeof startingRows>) =>
  list.map((row) => (row.kind === "text" ? "text" : row.key))

const content = (key: string) =>
  BUILTIN_BLOCKS.find((block) => block.key === key)!.content

const legacy = [
  "Some words from an old template.",
  "",
  '<block type="context">',
  "",
  "</block>",
  "",
  "## A loose heading",
  "",
  "- [ ] kept",
  "",
  '<block type="definition-of-done" sync>',
  "",
  "- [ ] Our own bar",
  "",
  "</block>"
].join("\n")

describe("startingRows", () => {
  it("lists a body of references as sections in order", () => {
    expect(startingRows(bug.body)).toEqual([
      {
        id: "section:expected-vs-actual:0",
        kind: "section",
        key: "expected-vs-actual"
      },
      {
        id: "section:steps-to-reproduce:0",
        kind: "section",
        key: "steps-to-reproduce"
      },
      { id: "section:environment:0", kind: "section", key: "environment" },
      {
        id: "section:definition-of-done:0",
        kind: "section",
        key: "definition-of-done"
      }
    ])
  })

  it("keeps loose text and customized sections as their own rows", () => {
    expect(startingRows(legacy).map((row) => row.kind)).toEqual([
      "text",
      "section",
      "text",
      "custom"
    ])
    expect(startingRows(spike.body).map((row) => row.kind)).toEqual([
      "section",
      "custom",
      "section"
    ])
  })

  it("gives repeated sections distinct ids", () => {
    const body = bodyOfRows([
      { id: "a", kind: "section", key: "context" },
      { id: "b", kind: "section", key: "context" }
    ])
    expect(startingRows(body).map((row) => row.id)).toEqual([
      "section:context:0",
      "section:context:1"
    ])
  })

  it("reads an empty body as no rows", () => {
    expect(startingRows("")).toEqual([])
  })
})

describe("bodyOfRows", () => {
  it("writes back what it read for bodies of references", () => {
    expect(bodyOfRows(startingRows(bug.body))).toBe(bug.body)
  })

  it("carries custom text and customized content through a reorder", () => {
    const rows = startingRows(legacy)
    const moved = moveRow(rows, rows[1].id, 2)
    const reread = startingRows(bodyOfRows(moved))
    expect(reread.map((row) => row.kind)).toEqual(["text", "custom", "section"])
    expect(reread[0]).toMatchObject({
      text: "Some words from an old template.\n\n## A loose heading\n\n- [ ] kept"
    })
    expect(reread[1]).toMatchObject({
      key: "definition-of-done",
      content: "- [ ] Our own bar",
      sync: true
    })
  })

  it("removes only the row that was asked for", () => {
    const rows = startingRows(legacy)
    const body = bodyOfRows(withoutRow(rows, rows[1].id))
    expect(body).toContain("Some words from an old template.")
    expect(body).toContain("- [ ] Our own bar")
    expect(body).not.toContain('<block type="context">')
  })
})

describe("moveRow", () => {
  const rows = startingRows(bug.body)

  it("moves a row up and down", () => {
    expect(keys(moveRow(rows, rows[2].id, -1))).toEqual([
      "expected-vs-actual",
      "environment",
      "steps-to-reproduce",
      "definition-of-done"
    ])
    expect(keys(moveRow(rows, rows[0].id, 1))).toEqual([
      "steps-to-reproduce",
      "expected-vs-actual",
      "environment",
      "definition-of-done"
    ])
  })

  it("leaves the list alone at its ends", () => {
    expect(moveRow(rows, rows[0].id, -1)).toBe(rows)
    expect(moveRow(rows, rows[3].id, 1)).toBe(rows)
    expect(moveRow(rows, "missing", 1)).toBe(rows)
  })
})

describe("sectionsToAdd", () => {
  it("offers visible sections the type does not start with yet", () => {
    const library = resolveLibrary(
      {
        org: EMPTY_LAYER,
        project: { ...EMPTY_LAYER, hiddenBlocks: ["out-of-scope"] }
      },
      true
    )
    const offered = sectionsToAdd(library, startingRows(bug.body)).map(
      (block) => block.key
    )
    expect(offered).toEqual(["acceptance-criteria", "context"])
  })

  it("appends the chosen section as a reference", () => {
    const rows = withSection(startingRows(bug.body), "context")
    expect(bodyOfRows(rows)).toBe(
      `${bug.body}\n\n<block type="context">\n\n</block>`
    )
  })
})

describe("contentSummary", () => {
  it("lists what a section asks for without its heading or hint braces", () => {
    expect(contentSummary(content("expected-vs-actual"))).toBe(
      "Expected: what should happen · Actual: what happens instead"
    )
    expect(contentSummary(content("definition-of-done"))).toBe(
      "Reviewed and merged · Tests cover the change · Docs updated where behaviour changed · Verified in the target environment"
    )
    expect(contentSummary("## Only a heading")).toBe("")
  })
})
