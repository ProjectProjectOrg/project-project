import { GroupColor, GroupId, type Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { filterableSprints, toggled } from "./ticketFilters"

const date = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const NOW = date("2026-05-09T00:00:00.000Z")
const groupId = Schema.decodeSync(GroupId)
const groupColor = Schema.decodeSync(GroupColor)

const sprint = (id: string, overrides: Partial<Group> = {}): Group => ({
  id: groupId(id),
  name: id,
  kind: "sprint",
  tickets: [],
  color: groupColor("#777777"),
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: date("2026-01-01T00:00:00.000Z"),
  updatedAt: date("2026-01-01T00:00:00.000Z"),
  ...overrides
})

describe("toggled", () => {
  it("adds an unselected value at the end", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"])
  })

  it("removes a selected value", () => {
    expect(toggled(["a", "b"], "a")).toEqual(["b"])
  })

  it("clears the filter when the last value is removed", () => {
    expect(toggled(["a"], "a")).toBeUndefined()
  })
})

describe("filterableSprints", () => {
  it("keeps active and planned sprints and drops completed ones", () => {
    const active = sprint("G-1", { startsAt: date("2026-05-01T00:00:00.000Z") })
    const planned = sprint("G-2", {
      startsAt: date("2026-06-01T00:00:00.000Z")
    })
    const completed = sprint("G-3", {
      completedAt: date("2026-05-02T00:00:00.000Z")
    })
    expect(filterableSprints([active, completed, planned], NOW)).toEqual([
      active,
      planned
    ])
  })
})
