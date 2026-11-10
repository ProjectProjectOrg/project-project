import { describe, expect, it } from "vitest"

import { toggleSlug, visibleColumns } from "./boardColumns"

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
