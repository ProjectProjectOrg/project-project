import { describe, expect, it } from "vitest"

import { matchTicketText, searchWords } from "./ticketTextSearch"

const body = [
  "## Context",
  "",
  "The sprint header flickers when the context menu opens.",
  "",
  "<!-- comments:start -->",
  "<!-- comment:c_1 -->",
  "---",
  "author:",
  "  kind: user",
  "  userId: u_1",
  "origin: native",
  "createdAt: '2026-11-06T12:55:06.533Z'",
  "---",
  "Repro on [Wouter](mention:user/u_2) staging with a cold cache.",
  "<!-- comments:end -->"
].join("\n")

const match = (query: string, title = "Header polish") =>
  matchTicketText({ title, body }, searchWords(query))

const markup = [
  '<block type="context">',
  "",
  "See [PR](https://github.com/x) from [Wouter](mention:user/u_2).",
  "",
  "</block>"
].join("\n")

const matchMarkup = (query: string) =>
  matchTicketText({ title: "Header polish", body: markup }, searchWords(query))

const code = (body: string) =>
  matchTicketText({ title: "Header polish", body }, searchWords("__init__"))

describe("matchTicketText", () => {
  it("prefers a body line over a heading with the same words", () => {
    expect(match("context")).toMatchObject({
      where: "description",
      snippet: {
        text: "The sprint header flickers when the context menu opens."
      }
    })
  })

  it("reports the comment author and the matched range", () => {
    expect(match("staging")).toMatchObject({
      where: "comment",
      author: { kind: "user", userId: "u_1" },
      snippet: {
        text: "Repro on @Wouter staging with a cold cache.",
        ranges: [[17, 24]]
      }
    })
  })

  it("matches words spread over the title, description and comments", () => {
    expect(match("polish flickers cache")).not.toBeNull()
  })

  it("ranks a full title match above body matches", () => {
    expect(match("header", "Header polish")?.where).toBe("title")
  })

  it("matches words only from their start", () => {
    expect(match("licker")).toBeNull()
    expect(match("flick")).not.toBeNull()
  })

  it("ignores comment metadata", () => {
    expect(match("native")).toBeNull()
  })

  it("ignores block tags, mention targets and words inside link urls", () => {
    for (const query of ["type", "block", "u_2", "github", "https"]) {
      expect(matchMarkup(query)).toBeNull()
    }
  })

  it("finds a ticket by the start of a link's url and shows the link's line", () => {
    expect(matchMarkup("http://GitHub.com/")).toMatchObject({
      where: "description",
      snippet: { text: "See PR from @Wouter.", ranges: [] }
    })
  })

  it("ranks visible text above a link url", () => {
    const url = "https://github.com/x"
    const result = matchTicketText(
      {
        title: "Header polish",
        body: `[PR](${url})\n\nMirrored at ${url} too.`
      },
      searchWords(url)
    )
    expect(result).toMatchObject({
      snippet: { text: "Mirrored at https://github.com/x too." }
    })
  })

  it("matches code text literally", () => {
    expect(code("Call `__init__` first.")).toMatchObject({
      snippet: { text: "Call __init__ first." }
    })
    expect(code("```py\ndef __init__(self):\n```")).toMatchObject({
      snippet: { text: "def __init__(self):" }
    })
  })

  it("matches visible link text", () => {
    expect(matchMarkup("pr")).toMatchObject({
      where: "description",
      snippet: { text: "See PR from @Wouter." }
    })
  })

  it("centres long lines on the first match", () => {
    const long = `${"word ".repeat(60)}needle ${"tail ".repeat(30)}`
    const result = matchTicketText(
      { title: "", body: long },
      searchWords("needle")
    )
    expect(result).toMatchObject({ where: "description" })
    if (result?.where !== "description") return
    const [[from, to]] = result.snippet.ranges
    expect(result.snippet.text.slice(from, to)).toBe("needle")
    expect(result.snippet.text.startsWith("…")).toBe(true)
  })
})
