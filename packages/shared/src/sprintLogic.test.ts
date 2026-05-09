import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import {
  GroupColor,
  GroupId,
  type Group,
  type GroupKind
} from "./schemas/Group"
import {
  isCarryover,
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type TicketStatus
} from "./sprintLogic"

const groupId = Schema.decodeUnknownSync(GroupId)
const groupColor = Schema.decodeUnknownSync(GroupColor)

const makeSprint = (
  id: string,
  overrides: Partial<Group> & { kind?: GroupKind } = {}
): Group => ({
  id: groupId(id),
  name: id,
  kind: overrides.kind ?? "sprint",
  tickets: [],
  color: groupColor("#777777"),
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides
})

const NOW = new Date("2026-05-09T00:00:00.000Z")

describe("isCarryover", () => {
  it.each([
    ["todo", true],
    ["in_progress", true],
    ["done", false]
  ] as ReadonlyArray<[TicketStatus, boolean]>)(
    "%s -> %s",
    (status, expected) => {
      expect(isCarryover(status)).toBe(expected)
    }
  )
})

describe("sprintState", () => {
  it("returns completed when completedAt is set", () => {
    const s = makeSprint("G-1", { completedAt: new Date("2026-04-01") })
    expect(sprintState(s, NOW)).toBe("completed")
  })
  it("returns planned when startsAt is in the future", () => {
    const s = makeSprint("G-1", { startsAt: new Date("2026-06-01") })
    expect(sprintState(s, NOW)).toBe("planned")
  })
  it("returns active when startsAt is in the past and not completed", () => {
    const s = makeSprint("G-1", { startsAt: new Date("2026-04-01") })
    expect(sprintState(s, NOW)).toBe("active")
  })
  it("returns active when endsAt is in the past but not completed (overdue)", () => {
    const s = makeSprint("G-1", {
      startsAt: new Date("2026-03-01"),
      endsAt: new Date("2026-04-01")
    })
    expect(sprintState(s, NOW)).toBe("active")
  })
})

describe("pickActiveSprint", () => {
  it("returns null when none active", () => {
    expect(
      pickActiveSprint(
        [makeSprint("G-1", { startsAt: new Date("2026-06-01") })],
        NOW
      )
    ).toBeNull()
  })
  it("picks the earliest startsAt among actives", () => {
    const a = makeSprint("G-1", { startsAt: new Date("2026-04-15") })
    const b = makeSprint("G-2", { startsAt: new Date("2026-04-01") })
    expect(pickActiveSprint([a, b], NOW)?.id).toBe("G-2")
  })
  it("ties break on createdAt", () => {
    const start = new Date("2026-04-01")
    const a = makeSprint("G-1", {
      startsAt: start,
      createdAt: new Date("2026-01-02")
    })
    const b = makeSprint("G-2", {
      startsAt: start,
      createdAt: new Date("2026-01-01")
    })
    expect(pickActiveSprint([a, b], NOW)?.id).toBe("G-2")
  })
  it("ignores non-sprint groups", () => {
    const epic = makeSprint("G-1", {
      kind: "epic",
      startsAt: new Date("2026-04-01")
    })
    expect(pickActiveSprint([epic], NOW)).toBeNull()
  })
})

describe("pickEarliestPlannedSprint", () => {
  it("ignores completed", () => {
    const c = makeSprint("G-1", {
      startsAt: new Date("2026-06-01"),
      completedAt: new Date("2026-05-01")
    })
    expect(pickEarliestPlannedSprint([c], NOW)).toBeNull()
  })
  it("picks earliest planned, ties by createdAt", () => {
    const start = new Date("2026-06-01")
    const a = makeSprint("G-1", {
      startsAt: start,
      createdAt: new Date("2026-01-02")
    })
    const b = makeSprint("G-2", {
      startsAt: start,
      createdAt: new Date("2026-01-01")
    })
    const later = makeSprint("G-3", { startsAt: new Date("2026-07-01") })
    expect(pickEarliestPlannedSprint([a, b, later], NOW)?.id).toBe("G-2")
  })
})
