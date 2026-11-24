import { expect, it } from "vitest"

import { loadHighlighter } from "../lib/highlight"
import { numberedCodeLines } from "./markdown-highlight"

const SOURCE = "/* one\ntwo */\nconst x = 1\n"

it("renders numbered plain code without a tokenizer while preserving the copied text", () => {
  const lines = numberedCodeLines(SOURCE, null)
  expect(lines.map(({ number }) => number)).toEqual([1, 2, 3])
  expect(
    lines.flatMap(({ tokens }) => tokens.map(({ text }) => text)).join("")
  ).toBe(SOURCE)
})

it("keeps a token's class on each line it spans", async () => {
  const { highlightCode } = await loadHighlighter()
  expect(
    numberedCodeLines(SOURCE, highlightCode(SOURCE, "ts")).map(
      ({ number, tokens }) => [
        number,
        tokens.map(({ text, kind }) => [text, kind])
      ]
    )
  ).toEqual([
    [
      1,
      [
        ["/* one", "comment"],
        ["\n", null]
      ]
    ],
    [
      2,
      [
        ["two */", "comment"],
        ["\n", null]
      ]
    ],
    [
      3,
      [
        ["const ", "keyword"],
        ["x ", null],
        ["= ", "punctuation"],
        ["1", "number"],
        ["\n", null]
      ]
    ]
  ])
})
