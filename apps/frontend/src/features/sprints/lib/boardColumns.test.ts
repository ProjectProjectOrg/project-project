import { describe, expect, it } from "vitest"

import { canHide, toggleSlug, visibleColumns } from "./boardColumns"

describe("toggleSlug", () => {
  it("adds a missing slug and removes a present one", () => {
    expect(toggleSlug(["todo"], "done")).toEqual(["todo", "done"])
    expect(toggleSlug(["todo", "done"], "todo")).toEqual(["done"])
  })
})

describe("visibleColumns", () => {
  it("keeps board order and drops hidden statuses", () => {
    expect(
      visibleColumns(["backlog", "todo", "review", "done"], ["done", "todo"])
    ).toEqual(["backlog", "review"])
  })
})

describe("canHide", () => {
  it("refuses to hide the last visible column but always allows showing", () => {
    const order = ["todo", "done"]
    expect(canHide(order, ["done"], "todo")).toBe(false)
    expect(canHide(order, ["done"], "done")).toBe(true)
    expect(canHide(order, [], "todo")).toBe(true)
  })
})
