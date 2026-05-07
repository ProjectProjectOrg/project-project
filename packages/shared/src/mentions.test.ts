import { describe, expect, it } from "vitest"
import {
  formatMentionHref,
  MENTION_SCHEME,
  parseMentionHref
} from "./mentions"

describe("formatMentionHref", () => {
  it("formats user mentions", () => {
    expect(formatMentionHref("user", "github_42")).toBe("mention:user/github_42")
  })
  it("formats ticket mentions", () => {
    expect(formatMentionHref("ticket", "T-12")).toBe("mention:ticket/T-12")
  })
})

describe("parseMentionHref", () => {
  it("parses user mentions", () => {
    expect(parseMentionHref("mention:user/github_42")).toEqual({
      type: "user",
      id: "github_42"
    })
  })
  it("parses ticket mentions", () => {
    expect(parseMentionHref("mention:ticket/T-12")).toEqual({
      type: "ticket",
      id: "T-12"
    })
  })
  it("returns null for non-mention hrefs", () => {
    expect(parseMentionHref("https://example.com")).toBeNull()
    expect(parseMentionHref("mailto:a@b.com")).toBeNull()
    expect(parseMentionHref("")).toBeNull()
  })
  it("returns null for unknown mention types", () => {
    expect(parseMentionHref("mention:doc/foo")).toBeNull()
    expect(parseMentionHref("mention:foo/bar")).toBeNull()
  })
  it("returns null for malformed mention hrefs", () => {
    expect(parseMentionHref("mention:user")).toBeNull()
    expect(parseMentionHref("mention:user/")).toBeNull()
    expect(parseMentionHref("mention:/foo")).toBeNull()
  })
  it("round-trips for every registered type", () => {
    const cases = [
      ["user", "github_42"],
      ["ticket", "T-1"]
    ] as const
    for (const [type, id] of cases) {
      expect(parseMentionHref(formatMentionHref(type, id))).toEqual({ type, id })
    }
  })
})

it("MENTION_SCHEME is the literal 'mention:'", () => {
  expect(MENTION_SCHEME).toBe("mention:")
})
