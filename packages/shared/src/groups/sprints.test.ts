import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { StatusSlug } from "../statuses/Status"
import { isCarryover, type TicketStatus } from "../tickets/Ticket"
import { Group, GroupColor, GroupId, type GroupKind } from "./Group"
import {
  backlogSprintSections,
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState
} from "./sprints"

const groupId = Schema.decodeUnknownSync(GroupId)
const groupColor = Schema.decodeUnknownSync(GroupColor)
const isoDate = (s: string): Date => DateTime.toDate(DateTime.makeUnsafe(s))

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
  createdAt: isoDate("2026-01-01T00:00:00.000Z"),
  updatedAt: isoDate("2026-01-01T00:00:00.000Z"),
  ...overrides
})

const NOW = isoDate("2026-05-09T00:00:00.000Z")

const decodeStatus = Schema.decodeUnknownSync(StatusSlug)

describe("isCarryover", () => {
  it.each([
    [decodeStatus("todo"), true],
    [decodeStatus("in_progress"), true],
    [decodeStatus("done"), false],
    [decodeStatus("wont_do"), false]
  ] as ReadonlyArray<[TicketStatus, boolean]>)(
    "%s -> %s",
    (status: TicketStatus, expected: boolean) => {
      expect(isCarryover(status, new Set(["done", "wont_do"]))).toBe(expected)
    }
  )
})

describe("sprintState", () => {
  it("returns completed when completedAt is set", () => {
    const s = makeSprint("G-1", { completedAt: isoDate("2026-04-01") })
    expect(sprintState(s, NOW)).toBe("completed")
  })
  it("returns planned when startsAt is null", () => {
    expect(sprintState(makeSprint("G-1"), NOW)).toBe("planned")
  })
  it("returns planned when startsAt is in the future", () => {
    const s = makeSprint("G-1", { startsAt: isoDate("2026-06-01") })
    expect(sprintState(s, NOW)).toBe("planned")
  })
  it("returns active when startsAt is in the past and not completed", () => {
    const s = makeSprint("G-1", { startsAt: isoDate("2026-04-01") })
    expect(sprintState(s, NOW)).toBe("active")
  })
  it("returns active when endsAt is in the past but not completed (overdue)", () => {
    const s = makeSprint("G-1", {
      startsAt: isoDate("2026-03-01"),
      endsAt: isoDate("2026-04-01")
    })
    expect(sprintState(s, NOW)).toBe("active")
  })
})

describe("pickActiveSprint", () => {
  it("returns null when none active", () => {
    expect(
      pickActiveSprint(
        [makeSprint("G-1", { startsAt: isoDate("2026-06-01") })],
        NOW
      )
    ).toBeNull()
  })
  it("picks the earliest startsAt among actives", () => {
    const a = makeSprint("G-1", { startsAt: isoDate("2026-04-15") })
    const b = makeSprint("G-2", { startsAt: isoDate("2026-04-01") })
    expect(pickActiveSprint([a, b], NOW)?.id).toBe("G-2")
  })
  it("ties break on createdAt", () => {
    const start = isoDate("2026-04-01")
    const a = makeSprint("G-1", {
      startsAt: start,
      createdAt: isoDate("2026-01-02")
    })
    const b = makeSprint("G-2", {
      startsAt: start,
      createdAt: isoDate("2026-01-01")
    })
    expect(pickActiveSprint([a, b], NOW)?.id).toBe("G-2")
  })
  it("ignores non-sprint groups", () => {
    const epic = makeSprint("G-1", {
      kind: "epic",
      startsAt: isoDate("2026-04-01")
    })
    expect(pickActiveSprint([epic], NOW)).toBeNull()
  })
})

describe("pickEarliestPlannedSprint", () => {
  it("ignores completed", () => {
    const c = makeSprint("G-1", {
      startsAt: isoDate("2026-06-01"),
      completedAt: isoDate("2026-05-01")
    })
    expect(pickEarliestPlannedSprint([c], NOW)).toBeNull()
  })
  it("picks earliest planned, ties by createdAt", () => {
    const start = isoDate("2026-06-01")
    const a = makeSprint("G-1", {
      startsAt: start,
      createdAt: isoDate("2026-01-02")
    })
    const b = makeSprint("G-2", {
      startsAt: start,
      createdAt: isoDate("2026-01-01")
    })
    const later = makeSprint("G-3", { startsAt: isoDate("2026-07-01") })
    expect(pickEarliestPlannedSprint([a, b, later], NOW)?.id).toBe("G-2")
  })
})

const decodeBacklogSprint = Schema.decodeSync(Group)

const sprint = (
  id: string,
  startsAt: string | null,
  completedAt: string | null = null
) =>
  decodeBacklogSprint({
    id,
    name: id,
    kind: "sprint",
    tickets: [],
    color: "#777777",
    startsAt,
    endsAt: null,
    completedAt,
    createdBy: "viewer",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01"
  })
const planned = sprint("G-1", "2026-09-20")
const later = sprint("G-2", "2026-09-27")
const active = sprint("G-3", "2026-09-01")
const completed = sprint("G-4", "2026-08-01", "2026-08-15")
const now = DateTime.toDate(DateTime.makeUnsafe("2026-09-13"))

describe("backlog sprint sections", () => {
  it("orders planned sprints chronologically before unscheduled, active, and completed", () => {
    expect(
      backlogSprintSections([completed, later, active, planned], undefined, now)
    ).toEqual([planned, later, null, active, completed])
  })
  it("keeps an unscheduled container when there are no sprints", () => {
    expect(backlogSprintSections([], undefined, now)).toEqual([null])
  })
  it("honors explicit sprint and unassigned filters without inventing sections", () => {
    const sprints = [planned, active, completed]
    expect(
      backlogSprintSections(sprints, [planned.id, "ungrouped"], now)
    ).toEqual([planned, null])
    expect(backlogSprintSections(sprints, [completed.id], now)).toEqual([
      completed
    ])
    expect(backlogSprintSections(sprints, [later.id], now)).toEqual([])
  })
})
