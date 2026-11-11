import { describe, expect, it } from "vitest"

import { appendPage } from "./searchPages"

const item = (id: string) => ({ id })

describe("appendPage", () => {
  it("appends the next page and takes its cursor", () => {
    expect(
      appendPage(
        { items: [item("A-2")], nextCursor: "c1" },
        { items: [item("A-1")], nextCursor: null }
      )
    ).toEqual({ items: [item("A-2"), item("A-1")], nextCursor: null })
  })

  it("skips items that shifted into the next page", () => {
    expect(
      appendPage(
        { items: [item("A-3"), item("A-2")], nextCursor: "c1" },
        { items: [item("A-2"), item("A-1")], nextCursor: "c2" }
      ).items.map((i) => i.id)
    ).toEqual(["A-3", "A-2", "A-1"])
  })
})
