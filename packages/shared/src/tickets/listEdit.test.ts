import { describe, expect, it } from "vitest"

import { applyListEdit, listEditBetween } from "./listEdit"

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
