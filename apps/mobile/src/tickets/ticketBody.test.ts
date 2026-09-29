import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import {
  type DescribeTicket,
  mentionedTicketIds,
  ticketBodyParts as partsWithIds,
  withMentionChips as withChips
} from "./ticketBody"

const unknownTickets: DescribeTicket = () => Option.none()

const ticketBodyParts = (body: string) =>
  partsWithIds(body, unknownTickets).map(({ id: _id, ...part }) => part)

const withMentionChips = (markdown: string) =>
  withChips(markdown, unknownTickets)

const inProgressTicket: DescribeTicket = (ticketId) =>
  ticketId === "APP-2"
    ? Option.some({ symbol: "smallcircle.filled.circle", color: "#3b82f6" })
    : Option.none()

describe("ticketBodyParts", () => {
  it("gives each part an id", () => {
    expect(
      partsWithIds(
        '<block type="context">\n\n## Context\n\n</block>',
        unknownTickets
      ).map(({ id }) => id)
    ).toEqual(["markdown-0", "unfilled-1"])
  })

  it("renders a filled block as its content, joined with the text around it", () => {
    const body = [
      "Intro.",
      "",
      '<block type="acceptance-criteria">',
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Works",
      "",
      "</block>",
      "",
      "Outro."
    ].join("\n")
    expect(ticketBodyParts(body)).toEqual([
      {
        kind: "markdown",
        text: "Intro.\n\n## Acceptance criteria\n\n- [ ] Works\n\nOutro."
      }
    ])
  })

  it("marks a block with nothing written as not filled in, under its heading", () => {
    const body = [
      '<block type="context">',
      "",
      "## Context",
      "",
      "</block>",
      "",
      "After."
    ].join("\n")
    expect(ticketBodyParts(body)).toEqual([
      { kind: "markdown", text: "## Context" },
      { kind: "unfilled" },
      { kind: "markdown", text: "After." }
    ])
  })

  it("rewrites mentions in blocks too", () => {
    const body = [
      '<block type="notes">',
      "",
      "See [T-195](mention:ticket/T-195).",
      "",
      "</block>"
    ].join("\n")
    expect(ticketBodyParts(body)).toEqual([
      { kind: "markdown", text: "See [T-195](mention:ticket/T-195)." }
    ])
  })
})

describe("withMentionChips", () => {
  it("shows an unknown ticket mention as its id", () => {
    expect(withMentionChips("1. [#195](mention:ticket/T-195) Access")).toBe(
      "1. [T-195](mention:ticket/T-195) Access"
    )
  })

  it("shows a known ticket as its status glyph and id", () => {
    expect(
      withChips("See [APP-2](mention:ticket/APP-2).", inProgressTicket)
    ).toBe(
      "See [![](sf:smallcircle.filled.circle?color=%233b82f6)APP-2](mention:ticket/APP-2)."
    )
  })

  it("shows a user mention with one leading @", () => {
    expect(
      withMentionChips(
        "[@Sanne](mention:user/u1) and [Wouter](mention:user/u2)"
      )
    ).toBe("[@Sanne](mention:user/u1) and [@Wouter](mention:user/u2)")
  })

  it("leaves other links and code blocks alone", () => {
    const markdown = [
      "[site](https://example.com)",
      "```md",
      "[T-1](mention:ticket/T-1)",
      "```"
    ].join("\n")
    expect(withMentionChips(markdown)).toBe(markdown)
  })
})

describe("mentionedTicketIds", () => {
  it("lists each mentioned ticket once, ignoring user mentions", () => {
    expect(
      mentionedTicketIds(
        "[APP-2](mention:ticket/APP-2) [@Sanne](mention:user/u1) [APP-2](mention:ticket/APP-2) [APP-1](mention:ticket/APP-1)"
      )
    ).toEqual(["APP-2", "APP-1"])
  })
})
