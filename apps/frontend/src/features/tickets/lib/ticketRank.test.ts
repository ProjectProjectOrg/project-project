import { TicketId, TicketRank } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { compareByRank, predictRank } from "./ticketRank"

const ticketId = Schema.decodeSync(TicketId)

const ranked = (rank: string, id: string) => ({
  id,
  rank: TicketRank.make(rank)
})

const deck = [ranked("a0", "T-1"), ranked("a1", "T-2"), ranked("a2", "T-3")]

const order = (moved: { id: string; rank: TicketRank }) =>
  [...deck.filter((t) => t.id !== moved.id), moved]
    .toSorted(compareByRank)
    .map((t) => t.id)

describe("predictRank", () => {
  it("places a ticket right after or right before its anchor", () => {
    const after = predictRank(deck, "T-3", { after: ticketId("T-1") })
    const before = predictRank(deck, "T-1", { before: ticketId("T-3") })
    expect(after && order({ id: "T-3", rank: after })).toEqual([
      "T-1",
      "T-3",
      "T-2"
    ])
    expect(before && order({ id: "T-1", rank: before })).toEqual([
      "T-2",
      "T-1",
      "T-3"
    ])
  })

  it("gives up when the anchor is missing, tied, or next to a placeholder rank", () => {
    expect(predictRank(deck, "T-1", { after: ticketId("T-9") })).toBeNull()
    expect(
      predictRank([ranked("a0", "T-1"), ranked("a0", "T-2")], "T-3", {
        after: ticketId("T-1")
      })
    ).toBeNull()
    expect(
      predictRank([ranked(" ", "T-9"), ranked("a0", "T-1")], "T-3", {
        before: ticketId("T-1")
      })
    ).toBeNull()
  })
})

describe("compareByRank", () => {
  it("breaks rank ties by id", () => {
    expect(
      [ranked("a0", "T-2"), ranked("a0", "T-1")]
        .toSorted(compareByRank)
        .map((t) => t.id)
    ).toEqual(["T-1", "T-2"])
  })
})
