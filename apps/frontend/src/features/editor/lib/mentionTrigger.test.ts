import { describe, expect, it } from "vitest"

import { matchMentionTrigger } from "./mentionTrigger"

describe("matchMentionTrigger", () => {
  it("matches a trigger at the start or after whitespace", () => {
    expect(matchMentionTrigger("#T-29", "@#")).toEqual({
      trigger: "#",
      leadOffset: 0,
      matchingString: "T-29",
      replaceableString: "#T-29"
    })
    expect(matchMentionTrigger("ping @lu", "@#")?.matchingString).toBe("lu")
  })

  it("keeps the query open across single spaces", () => {
    expect(
      matchMentionTrigger("see #merge concurrent", "@#")?.matchingString
    ).toBe("merge concurrent")
  })

  it("closes on a leading space, a double space or a newline", () => {
    expect(matchMentionTrigger("see # merge", "@#")).toBeNull()
    expect(matchMentionTrigger("see #merge  now", "@#")).toBeNull()
    expect(matchMentionTrigger("#merge\nnext", "@#")).toBeNull()
  })

  it("leaves markdown headings alone", () => {
    expect(matchMentionTrigger("## ", "@#")).toBeNull()
    expect(matchMentionTrigger("### Plan", "@#")).toBeNull()
  })

  it("ignores triggers inside words", () => {
    expect(matchMentionTrigger("mail luuk@igne", "@#")).toBeNull()
  })

  it("stops matching once the query grows past the limit", () => {
    expect(matchMentionTrigger(`#${"a ".repeat(30)}`, "@#")).toBeNull()
  })
})
