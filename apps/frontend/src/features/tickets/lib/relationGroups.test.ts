import {
  EMPTY_TICKET_RELATIONS,
  TicketId,
  TicketStatus,
  type LinkedTicket,
  type TicketRelations
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { openBlockers, pickBlock } from "./relationGroups"

const archivedOn = DateTime.toDate(DateTime.makeUnsafe("2026-04-02T00:00:00Z"))
const ticketId = Schema.decodeSync(TicketId)
const ticketStatus = Schema.decodeSync(TicketStatus)

const linked = (
  id: string,
  status = "todo",
  archivedAt: Date | null = null
): LinkedTicket => ({
  id: ticketId(id),
  title: id,
  status: ticketStatus(status),
  archivedAt
})

const relations: TicketRelations = {
  ...EMPTY_TICKET_RELATIONS,
  blockedBy: [
    linked("T-2"),
    linked("T-3", "done"),
    linked("T-4", "todo", archivedOn)
  ],
  blocking: [linked("T-5")],
  related: [linked("T-6")]
}

describe("pickBlock", () => {
  it.each([
    ["blockedBy", "T-2", "linked"],
    ["blockedBy", "T-5", "loop"],
    ["blocking", "T-2", "loop"],
    ["blocking", "T-5", "linked"],
    ["related", "T-6", "linked"],
    ["related", "T-2", null],
    ["blockedBy", "T-9", null]
  ] as const)("%s %s is %s", (kind, target, expected) => {
    expect(pickBlock(relations, kind, target)).toBe(expected)
  })
})

describe("openBlockers", () => {
  it("leaves out finished and archived blockers", () => {
    expect(
      openBlockers(relations, new Set(["done"])).map((ticket) => ticket.id)
    ).toEqual(["T-2"])
  })
})
