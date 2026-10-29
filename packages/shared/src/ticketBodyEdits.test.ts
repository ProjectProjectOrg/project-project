import { describe, expect, it } from "vitest"

import { applyTicketBodyEdits } from "./ticketBodyEdits"

const BODY = [
  "Intro.",
  "",
  '<block type="acceptance-criteria">',
  "",
  "## Acceptance criteria",
  "",
  "- [ ] First",
  "- [ ] Second",
  "",
  "</block>",
  "",
  '<block type="definition-of-done" sync>',
  "",
  "## Definition of done",
  "",
  "- [ ] Reviewed",
  "",
  "</block>",
  "",
  "Outro."
].join("\n")

describe("applyTicketBodyEdits", () => {
  it("ticks one checkbox and leaves the rest of the body byte for byte", () => {
    const result = applyTicketBodyEdits(BODY, [
      { kind: "replace", oldText: "- [ ] First", newText: "- [x] First" }
    ])

    expect(result).toEqual({
      ok: true,
      body: BODY.replace("- [ ] First", "- [x] First")
    })
  })

  it("rejects text that matches nothing", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "replace", oldText: "Missing", newText: "x" }
      ])
    ).toEqual({ ok: false, index: 0, failure: { code: "no_match" } })
  })

  it("rejects an ambiguous match unless replaceAll is set", () => {
    const edit = {
      kind: "replace",
      oldText: "- [ ]",
      newText: "- [x]"
    } as const

    expect(applyTicketBodyEdits(BODY, [edit])).toEqual({
      ok: false,
      index: 0,
      failure: { code: "multiple_matches", count: 3 }
    })
    expect(applyTicketBodyEdits(BODY, [{ ...edit, replaceAll: true }])).toEqual(
      { ok: true, body: BODY.replaceAll("- [ ]", "- [x]") }
    )
  })

  it("appends after the existing content, separated by a blank line", () => {
    expect(
      applyTicketBodyEdits("Intro.\n\n", [
        { kind: "append", text: "![shot.png](/api/attachments/o/1)" }
      ])
    ).toEqual({ ok: true, body: "Intro.\n\n![shot.png](/api/attachments/o/1)" })
    expect(
      applyTicketBodyEdits("", [{ kind: "append", text: "First line" }])
    ).toEqual({ ok: true, body: "First line" })
  })

  it("replaces a named block's content and keeps its tags and surroundings", () => {
    const result = applyTicketBodyEdits(BODY, [
      {
        kind: "replace_block",
        type: "acceptance-criteria",
        content: "## Acceptance criteria\n\n- [ ] Only one"
      }
    ])

    expect(result).toEqual({
      ok: true,
      body: BODY.replace("- [ ] First\n- [ ] Second", "- [ ] Only one")
    })
  })

  it("refuses to replace a synced, missing or repeated block", () => {
    const replace = (type: string, body = BODY) =>
      applyTicketBodyEdits(body, [
        { kind: "replace_block", type, content: "x" }
      ])
    const twice = `${BODY}\n\n<block type="acceptance-criteria">\n\nAgain\n\n</block>`

    expect(replace("definition-of-done")).toMatchObject({
      failure: { code: "block_synced" }
    })
    expect(replace("context")).toMatchObject({
      failure: { code: "block_not_found" }
    })
    expect(replace("acceptance-criteria", twice)).toMatchObject({
      failure: { code: "block_ambiguous", count: 2 }
    })
  })

  it("ignores block markup inside a code fence", () => {
    const fenced = [
      "```",
      '<block type="context">',
      "",
      "example",
      "",
      "</block>",
      "```"
    ].join("\n")

    expect(
      applyTicketBodyEdits(fenced, [
        { kind: "replace_block", type: "context", content: "x" }
      ])
    ).toMatchObject({ ok: false, failure: { code: "block_not_found" } })
  })

  it("applies edits in order and reports the index of the first failure", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "replace", oldText: "Intro.", newText: "Lead." },
        { kind: "replace", oldText: "Lead.", newText: "Opening." }
      ])
    ).toMatchObject({ ok: true, body: expect.stringMatching(/^Opening\./) })
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "append", text: "More." },
        { kind: "replace", oldText: "Intro.", newText: "Lead." },
        { kind: "replace", oldText: "Intro.", newText: "Again." }
      ])
    ).toEqual({ ok: false, index: 2, failure: { code: "no_match" } })
  })

  it("names the edit that breaks block markup", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "append", text: "More." },
        { kind: "append", text: '<block type="context">\n\nUnclosed' }
      ])
    ).toMatchObject({
      ok: false,
      index: 1,
      failure: { code: "block_markup" }
    })
  })

  it("keeps the indentation of inserted code", () => {
    expect(
      applyTicketBodyEdits("Intro.", [
        { kind: "append", text: "\n    const a = 1\n    const b = 2\n" }
      ])
    ).toEqual({
      ok: true,
      body: "Intro.\n\n    const a = 1\n    const b = 2"
    })
    expect(
      applyTicketBodyEdits(BODY, [
        {
          kind: "replace_block",
          type: "acceptance-criteria",
          content: "    indented"
        }
      ])
    ).toMatchObject({
      ok: true,
      body: expect.stringContaining("\n\n    indented\n\n</block>")
    })
  })
})
