import { describe, expect, it } from "vitest"

import { applyListEdit, composeListEdit, listEditBetween } from "./listEdit"

describe("applyListEdit", () => {
  it("replaces the list when given one", () => {
    expect(applyListEdit(["a", "b"], ["c", "c"])).toEqual(["c"])
  })

  it("adds and removes against the current list, keeping its order", () => {
    expect(
      applyListEdit(["a", "b", "c"], { add: ["d", "a"], remove: ["b", "x"] })
    ).toEqual(["a", "c", "d"])
  })
})

describe("composeListEdit", () => {
  it("ends with the same values as applying both edits in order", () => {
    const current = ["a", "b"]
    const first = { add: ["c"], remove: ["a"] }
    const then = { add: ["a"], remove: ["b"] }
    expect(
      applyListEdit(current, composeListEdit(first, then)).toSorted()
    ).toEqual(applyListEdit(applyListEdit(current, first), then).toSorted())
  })
})

describe("listEditBetween", () => {
  it("describes a change that reproduces the new list from the old one", () => {
    const before = ["a", "b"]
    const after = ["b", "c"]
    expect(listEditBetween(before, after)).toEqual({
      add: ["c"],
      remove: ["a"]
    })
    expect(applyListEdit(["x", "a"], listEditBetween(before, after))).toEqual([
      "x",
      "c"
    ])
  })
})
