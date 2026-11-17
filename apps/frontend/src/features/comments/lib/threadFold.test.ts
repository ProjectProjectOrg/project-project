import { describe, expect, it } from "vitest"

import { threadFold } from "./threadFold"

const replies = Array.from({ length: 5 }, (_, index) => ({
  comment: { id: `c_${index + 1}` }
}))

const fold = (
  input: Partial<Parameters<typeof threadFold>[0]>
): ReturnType<typeof threadFold> =>
  threadFold({
    replies,
    manual: null,
    target: "",
    editing: new Set(),
    ...input
  })

describe("threadFold", () => {
  it("folds all but the last two replies once a thread has more than three", () => {
    expect(fold({ replies: replies.slice(0, 3) }).foldable).toEqual([])
    expect(fold({}).foldable.map((reply) => reply.comment.id)).toEqual([
      "c_1",
      "c_2",
      "c_3"
    ])
    expect(fold({}).open).toBe(false)
  })

  it("opens for a linked reply until it is collapsed by hand", () => {
    expect(fold({ target: "c_2" }).open).toBe(true)
    expect(fold({ target: "c_2", manual: false }).open).toBe(false)
  })

  it("stays open while a folded reply is being edited, even when collapsed", () => {
    expect(fold({ editing: new Set(["c_2"]), manual: false }).open).toBe(true)
  })
})
