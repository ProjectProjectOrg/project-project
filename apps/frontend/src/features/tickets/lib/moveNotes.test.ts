import { describe, expect, it } from "vitest"

import { m } from "@/paraglide/messages"

import { moveNotes } from "./moveNotes"

const nothingDropped = {
  type: null,
  tags: [],
  assignees: [],
  estimate: false
}

describe("moveNotes", () => {
  it("always says the ticket leaves its sprint and epic", () => {
    expect(
      moveNotes({ branch: null, subTicketCount: 0 }, nothingDropped, [])
    ).toEqual([m.tickets_move_groups_note()])
  })

  it("names what the destination can't keep, with member names where known", () => {
    expect(
      moveNotes(
        { branch: "feat/T-1-thing", subTicketCount: 2 },
        {
          type: "Spike",
          tags: ["ui", "inbox"],
          assignees: ["u1", "u2"],
          estimate: true
        },
        [{ id: "u1", name: "Ada" }]
      )
    ).toEqual([
      m.tickets_move_drops_type({ type: "Spike" }),
      m.tickets_move_drops_tags({ tags: "ui, inbox" }),
      m.tickets_move_drops_assignees({ names: "Ada, u2" }),
      m.tickets_move_drops_estimate(),
      m.tickets_move_branch_note(),
      m.tickets_move_sub_tickets_note({ count: 2 }),
      m.tickets_move_groups_note()
    ])
  })
})
