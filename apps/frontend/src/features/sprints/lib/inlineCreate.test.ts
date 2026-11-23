import { DEFAULT_TICKET_SORT, GroupId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import type { QuickCreateInput } from "@/features/tickets/lib/ticketRows"

import {
  createdRowInPlace,
  createdTicketShows,
  onlySprint,
  placesInManualOrder
} from "./inlineCreate"

const now = DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
const input = {
  payload: { title: "New", status: TicketStatus.make("todo") },
  prediction: {
    clientId: "a",
    createdBy: "user-1",
    projectPrefix: "T",
    estimation: "off"
  }
} satisfies QuickCreateInput
const manual = { key: "manual", dir: "asc" } as const
const sprint = GroupId.make("G-3")

describe("inline create", () => {
  it("shows a new ticket unless a filter it can't match is on", () => {
    expect(createdTicketShows({ sort: manual }, input, now)).toBe(true)
    expect(
      createdTicketShows({ sort: manual, assignee: ["mine"] }, input, now)
    ).toBe(false)
  })

  it("places by position only in ascending manual order", () => {
    expect(placesInManualOrder({ sort: manual })).toBe(true)
    expect(placesInManualOrder({ sort: { ...manual, dir: "desc" } })).toBe(
      false
    )
    expect(placesInManualOrder({ sort: DEFAULT_TICKET_SORT })).toBe(
      DEFAULT_TICKET_SORT.key === "manual" && DEFAULT_TICKET_SORT.dir === "asc"
    )
  })

  it("leaves a backlog filtered by sprint to the refetch", () => {
    expect(
      createdRowInPlace({ sort: manual, groupId: [sprint] }, input, now)
    ).toBe(false)
    expect(
      createdRowInPlace({ sort: manual, groupId: ["ungrouped"] }, input, now)
    ).toBe(true)
  })

  it("files into the sprint when exactly one is filtered", () => {
    expect(onlySprint({ sort: manual, groupId: [sprint] })).toBe(sprint)
    expect(onlySprint({ sort: manual, groupId: ["ungrouped"] })).toBe(undefined)
    expect(
      onlySprint({ sort: manual, groupId: [sprint, GroupId.make("G-4")] })
    ).toBe(undefined)
  })
})
