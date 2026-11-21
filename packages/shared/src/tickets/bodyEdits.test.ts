import * as Result from "effect/Result"
import { describe, expect, it } from "vitest"

import { applyTicketBodyEdits, TicketBodyEditFailure } from "./bodyEdits"

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

    expect(result).toEqual(
      Result.succeed(BODY.replace("- [ ] First", "- [x] First"))
    )
  })

  it("rejects text that matches nothing", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "replace", oldText: "Missing", newText: "x" }
      ])
    ).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.NoMatch.make({})
      })
    )
  })

  it("rejects an ambiguous match unless replaceAll is set", () => {
    const edit = {
      kind: "replace",
      oldText: "- [ ]",
      newText: "- [x]"
    } as const

    expect(applyTicketBodyEdits(BODY, [edit])).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.MultipleMatches.make({ count: 3 })
      })
    )
    expect(applyTicketBodyEdits(BODY, [{ ...edit, replaceAll: true }])).toEqual(
      Result.succeed(BODY.replaceAll("- [ ]", "- [x]"))
    )
  })

  it("appends after the existing content, separated by a blank line", () => {
    expect(
      applyTicketBodyEdits("Intro.\n\n", [
        { kind: "append", text: "![shot.png](/api/attachments/o/1)" }
      ])
    ).toEqual(Result.succeed("Intro.\n\n![shot.png](/api/attachments/o/1)"))
    expect(
      applyTicketBodyEdits("", [{ kind: "append", text: "First line" }])
    ).toEqual(Result.succeed("First line"))
  })

  it("replaces a named block's content and keeps its tags and surroundings", () => {
    const result = applyTicketBodyEdits(BODY, [
      {
        kind: "replace_block",
        type: "acceptance-criteria",
        content: "## Acceptance criteria\n\n- [ ] Only one"
      }
    ])

    expect(result).toEqual(
      Result.succeed(
        BODY.replace("- [ ] First\n- [ ] Second", "- [ ] Only one")
      )
    )
  })

  it("refuses to replace a synced, missing or repeated block", () => {
    const replace = (type: string, body = BODY) =>
      applyTicketBodyEdits(body, [
        { kind: "replace_block", type, content: "x" }
      ])
    const twice = `${BODY}\n\n<block type="acceptance-criteria">\n\nAgain\n\n</block>`

    expect(replace("definition-of-done")).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.BlockSynced.make({})
      })
    )
    expect(replace("context")).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.BlockNotFound.make({})
      })
    )
    expect(replace("acceptance-criteria", twice)).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.BlockAmbiguous.make({ count: 2 })
      })
    )
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
    ).toEqual(
      Result.fail({
        index: 0,
        failure: TicketBodyEditFailure.cases.BlockNotFound.make({})
      })
    )
  })

  it("applies edits in order and reports the index of the first failure", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "replace", oldText: "Intro.", newText: "Lead." },
        { kind: "replace", oldText: "Lead.", newText: "Opening." }
      ])
    ).toEqual(Result.succeed(expect.stringMatching(/^Opening\./)))
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "append", text: "More." },
        { kind: "replace", oldText: "Intro.", newText: "Lead." },
        { kind: "replace", oldText: "Intro.", newText: "Again." }
      ])
    ).toEqual(
      Result.fail({
        index: 2,
        failure: TicketBodyEditFailure.cases.NoMatch.make({})
      })
    )
  })

  it("names the edit that breaks block markup", () => {
    expect(
      applyTicketBodyEdits(BODY, [
        { kind: "append", text: "More." },
        { kind: "append", text: '<block type="context">\n\nUnclosed' }
      ])
    ).toEqual(
      Result.fail({
        index: 1,
        failure: expect.objectContaining({ _tag: "BlockMarkup" })
      })
    )
  })

  it("keeps the indentation of inserted code", () => {
    expect(
      applyTicketBodyEdits("Intro.", [
        { kind: "append", text: "\n    const a = 1\n    const b = 2\n" }
      ])
    ).toEqual(Result.succeed("Intro.\n\n    const a = 1\n    const b = 2"))
    expect(
      applyTicketBodyEdits(BODY, [
        {
          kind: "replace_block",
          type: "acceptance-criteria",
          content: "    indented"
        }
      ])
    ).toEqual(
      Result.succeed(expect.stringContaining("\n\n    indented\n\n</block>"))
    )
  })
})
