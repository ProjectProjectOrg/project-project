import { TicketId, TicketStatus, type TicketDetail } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { applyTicketDetailPatch, applyTicketPatch } from "./ticketPatch"

const base = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  estimate: null,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  creator: null,
  updater: null,
  body: "Before"
} satisfies TicketDetail

describe("applyTicketPatch", () => {
  it("overrides only the provided fields", () => {
    const next = applyTicketPatch(base, { priority: "high" })
    expect(next.priority).toBe("high")
    expect(next.title).toBe("Before")
  })

  it("clears the estimate on null and keeps it when the patch omits it", () => {
    const estimated = {
      ...base,
      estimate: { unit: "tshirt", value: "M" } as const
    }
    expect(applyTicketPatch(estimated, { estimate: null }).estimate).toBeNull()
    expect(applyTicketPatch(estimated, { title: "Next" }).estimate).toEqual({
      unit: "tshirt",
      value: "M"
    })
  })

  it("ignores body, which is not part of a list row", () => {
    const next = applyTicketPatch(base, { body: "After" })
    expect(next).not.toHaveProperty("body", "After")
  })
})

describe("applyTicketDetailPatch", () => {
  it("also applies body", () => {
    const next = applyTicketDetailPatch(base, { body: "After", title: "Next" })
    expect(next.body).toBe("After")
    expect(next.title).toBe("Next")
  })
})
