import { formatMentionHref } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { excerptParts, mentionedUserIds, paragraphMentioning } from "./excerpt"

const luuk = `[@Luuk Munneke](${formatMentionHref("user", "u-luuk")})`
const ticket = `[PP-351](${formatMentionHref("ticket", "PP-351")})`

describe("excerptParts", () => {
  it("turns a user mention into a handle", () => {
    expect(
      excerptParts(
        `${luuk} can the reply stay visible?`,
        new Map([["u-luuk", "luuk"]])
      )
    ).toEqual([
      { kind: "mention", userId: "u-luuk", handle: "luuk" },
      { kind: "text", text: " can the reply stay visible?" }
    ])
  })

  it("falls back to the link's label without its @", () => {
    expect(excerptParts(`ask ${luuk}`, new Map())).toEqual([
      { kind: "text", text: "ask " },
      { kind: "mention", userId: "u-luuk", handle: "Luuk Munneke" }
    ])
  })

  it("keeps ticket mentions and links as their text", () => {
    expect(
      excerptParts(`see ${ticket} and [the docs](https://x.dev)`, new Map())
    ).toEqual([{ kind: "text", text: "see PP-351 and the docs" }])
  })

  it("flattens markdown to one line", () => {
    expect(
      excerptParts(
        "## Plan\n\n- **first** step\n- `second`\n\n```ts\ncode()\n```\n> quoted",
        new Map()
      )
    ).toEqual([{ kind: "text", text: "Plan first step second quoted" }])
  })

  it("cuts long text with an ellipsis", () => {
    const parts = excerptParts("word ".repeat(80), new Map())
    const text = parts
      .map((part) => (part.kind === "text" ? part.text : ""))
      .join("")
    expect(text.length).toBeLessThanOrEqual(201)
    expect(text.endsWith("…")).toBe(true)
  })
})

describe("excerptParts with underscores", () => {
  it("leaves ids inside links alone and still strips emphasis", () => {
    expect(
      excerptParts(
        `_hey_ [@Sam](${formatMentionHref("user", "u_sam_1")})`,
        new Map([["u_sam_1", "sam"]])
      )
    ).toEqual([
      { kind: "text", text: "hey " },
      { kind: "mention", userId: "u_sam_1", handle: "sam" }
    ])
  })
})

describe("paragraphMentioning", () => {
  it("picks the paragraph that mentions the person", () => {
    expect(
      paragraphMentioning(`Intro.\n\nPing ${luuk} here.\n\nOutro.`, "u-luuk")
    ).toBe(`Ping ${luuk} here.`)
  })

  it("falls back to the first paragraph", () => {
    expect(paragraphMentioning("First.\n\nSecond.", "u-luuk")).toBe("First.")
  })
})

describe("mentionedUserIds", () => {
  it("lists only user mentions", () => {
    expect(mentionedUserIds(`${luuk} on ${ticket}`)).toEqual(["u-luuk"])
  })
})
