import { describe, expect, it } from "vitest"

import { ticketParticipants } from "./ticketParticipants"

describe("ticketParticipants", () => {
  it("lists assignees, the creator, then commenters, once each", () => {
    expect(
      ticketParticipants({ assignees: ["ann"], createdBy: "bob" }, [
        "dirk",
        "ann",
        "cas"
      ])
    ).toEqual(["ann", "bob", "dirk", "cas"])
  })

  it("falls back to commenters while the ticket loads", () => {
    expect(ticketParticipants(null, ["cas"])).toEqual(["cas"])
  })
})
