import { describe, expect, it } from "vitest"

import { appendMentionPage } from "./mentionPages"

const candidate = (id: string) => ({ id, label: id })

describe("appendMentionPage", () => {
  it("appends the next page and takes its cursor", () => {
    expect(
      appendMentionPage(
        { candidates: [candidate("A-2")], nextCursor: "c1" },
        { candidates: [candidate("A-1")], nextCursor: null }
      )
    ).toEqual({
      candidates: [candidate("A-2"), candidate("A-1")],
      nextCursor: null
    })
  })

  it("skips candidates that shifted into the next page", () => {
    expect(
      appendMentionPage(
        { candidates: [candidate("A-3"), candidate("A-2")], nextCursor: "c1" },
        { candidates: [candidate("A-2"), candidate("A-1")], nextCursor: "c2" }
      ).candidates.map((c) => c.id)
    ).toEqual(["A-3", "A-2", "A-1"])
  })
})
