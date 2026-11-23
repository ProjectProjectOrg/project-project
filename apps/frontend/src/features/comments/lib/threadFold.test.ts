import { describe, expect, it } from "vitest"

import { foldedAuthors, threadFold } from "./threadFold"

const replies = Array.from({ length: 5 }, (_, index) => ({
  comment: { id: `c_${index + 1}` }
}))

const fold = (input: Partial<Parameters<typeof threadFold>[0]>) =>
  threadFold({
    replies,
    resolved: false,
    manual: null,
    target: "",
    editing: new Set(),
    held: null,
    ...input
  })

const foldedIds = (input: Partial<Parameters<typeof threadFold>[0]>) =>
  fold(input).foldable.map((reply) => reply.comment.id)

describe("threadFold", () => {
  it("folds all but the last two replies once an open thread has more than three", () => {
    expect(foldedIds({ replies: replies.slice(0, 3) })).toEqual([])
    expect(foldedIds({})).toEqual(["c_1", "c_2", "c_3"])
    expect(fold({}).open).toBe(false)
  })

  it("folds everything but the last reply once the thread is resolved", () => {
    expect(foldedIds({ replies: replies.slice(0, 2), resolved: true })).toEqual(
      ["c_1"]
    )
    expect(foldedIds({ resolved: true })).toEqual(["c_1", "c_2", "c_3", "c_4"])
  })

  it("opens for a linked reply until it is collapsed by hand", () => {
    expect(fold({ target: "c_2" }).open).toBe(true)
    expect(fold({ target: "c_2", manual: false }).open).toBe(false)
  })

  it("folds no more than it held while replying", () => {
    expect(foldedIds({ held: 0 })).toEqual([])
    expect(foldedIds({ held: 2 })).toEqual(["c_1", "c_2"])
    expect(foldedIds({ held: 0, resolved: true })).toEqual([
      "c_1",
      "c_2",
      "c_3",
      "c_4"
    ])
  })

  it("stays open while a folded reply is being edited, even when collapsed", () => {
    expect(fold({ editing: new Set(["c_2"]), manual: false }).open).toBe(true)
  })
})

const author = (displayName: string) => ({
  author: {
    kind: "imported" as const,
    source: "jira" as const,
    displayName,
    sourceId: displayName
  }
})

describe("foldedAuthors", () => {
  it("names each author once in a readable list", () => {
    expect(
      foldedAuthors(
        [author("Sam"), author("Noor"), author("Sam"), author("Luuk")],
        "en"
      ).names
    ).toBe("Sam, Noor, and Luuk")
  })
})
