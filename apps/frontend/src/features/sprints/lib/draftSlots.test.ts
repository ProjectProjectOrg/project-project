import { describe, expect, it } from "vitest"

import { draftSlots, withKeptIndexes } from "./draftSlots"

describe("draftSlots", () => {
  it("shifts the tickets at and after the draft down one slot", () => {
    const { ticketIndexOf, slotIndexOf } = draftSlots(1)

    expect([0, 1, 2].map(slotIndexOf)).toEqual([0, 2, 3])
    expect([0, 2, 3].map(ticketIndexOf)).toEqual([0, 1, 2])
  })

  it("maps one to one without a draft", () => {
    const { ticketIndexOf, slotIndexOf } = draftSlots(-1)

    expect([0, 1].map(slotIndexOf)).toEqual([0, 1])
    expect([0, 1].map(ticketIndexOf)).toEqual([0, 1])
  })
})

describe("withKeptIndexes", () => {
  it("adds kept rows outside the visible range, in order", () => {
    expect(withKeptIndexes([3, 4, 5], [9, -1, 4, 0])).toEqual([0, 3, 4, 5, 9])
  })
})
