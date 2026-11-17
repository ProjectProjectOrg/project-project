import { TicketId, TicketRank, TicketStatus } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { boardMove, FIRST_SCREEN_CARDS, firstScreenCards } from "./boardUtils"

const id = Schema.decodeSync(TicketId)
const todo = Schema.decodeSync(TicketStatus)("todo")
const done = Schema.decodeSync(TicketStatus)("done")

const card = (ticketId: string, rank: string) => ({
  id: id(ticketId),
  rank: TicketRank.make(rank)
})

const column = [card("T-1", "a0"), card("T-2", "a1")]

describe("boardMove", () => {
  it("drops above or below the card under the pointer", () => {
    expect(
      boardMove(column, column, id("T-3"), {
        type: "card",
        id: id("T-2"),
        edge: "top"
      })?.to
    ).toEqual({ before: id("T-2") })
    expect(
      boardMove(column, column, id("T-3"), {
        type: "card",
        id: id("T-1"),
        edge: "bottom"
      })?.to
    ).toEqual({ after: id("T-1") })
  })

  it("drops on a column below its last other card, and nowhere in an empty one", () => {
    const drop = { type: "column", status: todo } as const
    expect(boardMove(column, column, id("T-1"), drop)?.to).toEqual({
      after: id("T-2")
    })
    expect(boardMove([], [], id("T-3"), drop)).toBeUndefined()
  })

  it("sends no move when the card would land where it already is", () => {
    expect(
      boardMove(column, column, id("T-2"), {
        type: "card",
        id: id("T-1"),
        edge: "bottom"
      })
    ).toBeUndefined()
    expect(
      boardMove(column, column, id("T-1"), {
        type: "card",
        id: id("T-2"),
        edge: "top"
      })
    ).toBeUndefined()
  })
})

it("keeps each column's first screen of cards", () => {
  const cards = [
    ...Array.from({ length: FIRST_SCREEN_CARDS + 5 }, (_, i) => ({
      id: `T-${i}`,
      status: todo
    })),
    { id: "T-done", status: done }
  ]
  const kept = firstScreenCards(cards).map((kept) => kept.id)
  expect(kept).toEqual([
    ...cards.slice(0, FIRST_SCREEN_CARDS).map((card) => card.id),
    "T-done"
  ])
})
